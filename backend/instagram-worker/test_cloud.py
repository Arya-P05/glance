import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from cloud import CloudWorker, report

class CloudTests(unittest.TestCase):
    def test_session_persists_privately_before_local_write(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Mock()
            w = CloudWorker(db, Path(directory))
            w.save_session({'device': 'test'})
            self.assertEqual(db.request.call_args.args, ('POST', 'instagram_worker_state'))
            self.assertTrue((Path(directory)/'session.json').exists())

    def test_receipt_survives_remote_write_failure_locally(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Mock()
            db.request.side_effect = TimeoutError
            w = CloudWorker(db, Path(directory))
            w.attempt = Path(directory)
            w.run = {'slot':'slot', 'lease':'lease'}
            with self.assertRaises(TimeoutError):
                w.save_receipt({'media_id':'123'})
            self.assertTrue((Path(directory)/'receipt.json').exists())
            self.assertEqual(db.request.call_args.kwargs['params']['lease'], 'eq.lease')

class ReportingTests(unittest.TestCase):
    def test_missed_window_is_not_success(self):
        self.assertEqual(report({'outcome':'missed_window'}), 1)
        self.assertEqual(report({'outcome':'blocked_uncertain'}), 1)
        self.assertEqual(report({'outcome':'verification_failed'}), 1)

    def test_normal_idle_and_verified_posts(self):
        self.assertEqual(report({'outcome':'slot_already_handled'}), 0)
        self.assertEqual(report({'outcome':'posted', 'music_verified':True}), 0)
