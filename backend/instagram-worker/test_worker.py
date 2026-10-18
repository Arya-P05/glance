import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from types import SimpleNamespace
from worker import Worker, CONFIG, choose_track, verified_music


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Mock()
        self.worker = Worker(self.db, Path(self.tmp.name))
        self.worker.run = {'slot': 'slot', 'lease': 'lease'}

    def test_timeout_never_replays_configure(self):
        publish = Mock(side_effect=TimeoutError)
        with self.assertRaises(TimeoutError):
            self.worker.configure_once(publish)
        with self.assertRaises(RuntimeError):
            self.worker.configure_once(publish)
        self.assertEqual(publish.call_count, 1)
        self.assertEqual(self.db.rpc.call_count, 1)

    def test_lost_or_uncertain_database_lease_prevents_publish(self):
        self.db.rpc.side_effect = TimeoutError
        publish = Mock()
        with self.assertRaises(TimeoutError):
            self.worker.configure_once(publish)
        publish.assert_not_called()

    def test_rotation_and_unavailable_tracks(self):
        config = json.loads(CONFIG.read_text())
        available = {t['track_id'] for t in config['tracks']}
        history = []
        for _ in config['tracks']:
            t = choose_track(config, available, history, 'A reminder')
            history.append({'music_track_id': t['track_id']})
        self.assertEqual(len({h['music_track_id'] for h in history}), 4)
        with self.assertRaises(RuntimeError):
            choose_track(config, {history[-1]['music_track_id']}, history, '')

    def test_verification_requires_five_photos_and_exact_song(self):
        raw = {'media_type': 8, 'carousel_media': [{'media_type': 1} for _ in range(5)],
               'music_metadata': {'music_info': {'music_asset_info': {'audio_asset_id': '42'}}}}
        self.assertTrue(verified_music(raw, '42'))
        self.assertFalse(verified_music(raw, '43'))
        raw['carousel_media'][0]['media_type'] = 2
        self.assertFalse(verified_music(raw, '42'))

    def test_response_diagnostics_do_not_store_secrets(self):
        self.worker.attempt = Path(self.tmp.name)
        response = Mock(status_code=400)
        response.json.return_value = {'error_type': 'secret-value', 'password': 'secret-password'}
        self.worker.capture(response)
        log = (self.worker.attempt/'events.jsonl').read_text()
        self.assertNotIn('secret', log)
        self.assertIn('other', log)

    def test_success_records_receipt_even_if_music_verification_fails(self):
        w = self.worker
        track = w.config['tracks'][0]
        self.db.url = 'https://example.test'
        self.db.rows.side_effect = [
            [{'id': 'carousel', 'title': 'Rest', 'caption': 'caption', 'status': 'posting'}],
            [{'position': n, 'posts': {'storage_path': f'{n}.jpg', 'status': 'active'}} for n in range(1, 6)],
            []]
        client = Mock()
        client.get_settings.return_value = {}
        client.private_request.side_effect = TimeoutError
        def publish(paths, caption, music, **kwargs):
            self.assertEqual(len(paths), 5)
            kwargs['configure_handler']()
            return SimpleNamespace(pk='123', code='test')
        client.album_upload_with_music.side_effect = publish
        w.client = Mock(return_value=client)
        w.catalog = Mock(return_value=({'alacorn_session_id': 'music-session'}, {track['track_id']: track}))
        response = Mock(content=b'photo')
        with patch('worker.requests.get', return_value=response):
            w.execute({'slot': 'slot', 'lease': 'lease', 'carousel_id': 'carousel'})
        client.album_upload_with_music.assert_called_once()
        self.db.rpc.assert_any_call('finish_instagram_music_slot', p_slot='slot', p_lease='lease',
                                   p_media='123', p_permalink='https://www.instagram.com/p/test/', p_verified=False)
        self.assertTrue((w.attempt/'receipt.json').exists())
        self.assertEqual(list(w.attempt.glob('slide-*.jpg')), [])


if __name__ == '__main__':
    unittest.main()
