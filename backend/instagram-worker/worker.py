"""Supabase-scheduled photo carousels with Instagram music. No publish retries."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import logging
import os
import re
import signal
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from instagrapi import Client

CONFIG = Path(__file__).resolve().parent.parent / 'instagram-music.json'
AUTH_ERRORS = {'LoginRequired', 'ChallengeRequired', 'CheckpointRequired', 'FeedbackRequired',
               'PleaseWaitFewMinutes', 'ClientThrottledError', 'SentryBlock', 'TwoFactorRequired'}


def now():
    return datetime.now(timezone.utc).isoformat()


def private_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False) as f:
        tmp = Path(f.name)
        json.dump(data, f)
        f.flush()
        os.fsync(f.fileno())
    try:
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def emit(event, **fields):
    print(json.dumps({'time': now(), 'event': event, **fields}), flush=True)


@contextlib.contextmanager
def quiet_library():
    # Third-party logs/exception strings can include credentials or raw responses.
    with open(os.devnull, 'w') as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        yield


class BackendError(RuntimeError):
    pass


class Database:
    def __init__(self):
        self.url = os.environ['SUPABASE_URL'].rstrip('/')
        self.http = requests.Session()
        key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
        self.http.headers.update({'apikey': key, 'Authorization': f'Bearer {key}'})

    def request(self, method, path, **kwargs):
        # No automatic retry for writes: an HTTP timeout can hide a committed mutation.
        response = self.http.request(method, self.url + '/rest/v1/' + path, timeout=(10, 30), **kwargs)
        if not response.ok:
            raise BackendError(f'HTTP {response.status_code}')
        return response.json() if response.content else None

    def rpc(self, name, **payload):
        return self.request('POST', 'rpc/' + name, json=payload)

    def rows(self, table, **params):
        return self.request('GET', table, params=params)


# Matches the JS selector used by the local preparation tool.
def choose_track(config, available, history, text):
    last = history[-1].get('music_track_id') if history else None
    eligible = [t for t in config['tracks'] if t['track_id'] in available and t['track_id'] != last]
    if not eligible:
        raise RuntimeError('No approved non-repeating music available')
    words = set(re.findall(r'[a-z]+', text.lower()))
    matching = [t for t in eligible if words.intersection(t['keywords'])]
    def last_used(track):
        indices = [i for i, entry in enumerate(history) if entry.get('music_track_id') == track['track_id']]
        return max(indices, default=-1)
    return min(matching or eligible, key=last_used)


def find_track(value, track_id):
    if isinstance(value, dict):
        if str(value.get('id', value.get('audio_asset_id', ''))) == track_id and value.get('audio_cluster_id'):
            return value
        for child in value.values():
            found = find_track(child, track_id)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_track(child, track_id)
            if found:
                return found
    return None


def verified_music(raw, track_id):
    info = (raw.get('music_metadata') or {}).get('music_info') or {}
    asset = info.get('music_asset_info') or {}
    return (raw.get('media_type') == 8 and len(raw.get('carousel_media', [])) == 5
            and all(item.get('media_type') == 1 for item in raw['carousel_media'])
            and str(asset.get('audio_asset_id')) == track_id)


class Worker:
    def __init__(self, db, state, client_factory=Client):
        self.db, self.state, self.client_factory = db, state, client_factory
        self.config = json.loads(CONFIG.read_text())
        self.stage = 'idle'
        self.run = None
        self.attempt = None
        self.configure_started = False
        self.receipt = None
        self.failed = False

    def event(self, event, **fields):
        record = {'time': now(), 'stage': self.stage, 'event': event, **fields}
        if self.attempt:
            with (self.attempt/'events.jsonl').open('a') as f:
                f.write(json.dumps(record) + '\n')
        # stdout is suppressed around library calls; file diagnostics persist.

    def capture(self, response, *args, **kwargs):
        try:
            body = response.json()
            error = body.get('error_type') if isinstance(body, dict) else None
            if error not in {'login_required', 'challenge_required', 'feedback_required', 'rate_limit_error'}:
                error = 'other' if error else None
            self.event('response', http_status=response.status_code, error_category=error)
        except Exception:
            pass
        return response

    def client(self):
        self.stage = 'account_validation'
        path = self.state/'session.json'
        if not path.exists():
            raise RuntimeError('Persistent session file required')
        c = self.client_factory()
        c.load_settings(path)
        c.set_retry_config(session_retry_total=0, public_request_retries_count=1)
        c.delay_range = [1, 2]
        def stop(client, error):
            raise error
        c.handle_exception = stop
        for session in (c.private, c.public):
            original = session.request
            def bounded(*args, _request=original, **kwargs):
                if kwargs.get('timeout') is None:
                    kwargs['timeout'] = (10, 30)
                return _request(*args, **kwargs)
            session.request = bounded
            session.hooks.setdefault('response', []).append(self.capture)
        if c.account_info().username != os.environ.get('INSTAGRAM_USERNAME', 'dailyglance'):
            raise RuntimeError('Account mismatch')
        self.save_session(c.get_settings())
        return c

    def save_session(self, settings):
        private_json(self.state/'session.json', settings)

    def save_receipt(self, receipt):
        private_json(self.attempt/'receipt.json', receipt)

    def catalog(self, c, required=None):
        self.stage = 'music_catalog'
        music = c.music_in_feed_audio_browser()
        found = {}
        for track in self.config['tracks']:
            if required and track['track_id'] != required:
                continue
            self.heartbeat()
            entry = find_track(music, track['track_id'])
            if entry is None:
                entry = find_track(c.music_search_v2(track['title'] + ' ' + track['artist']), track['track_id'])
            if entry:
                found[track['track_id']] = entry
        if not found:
            raise RuntimeError('Approved music unavailable')
        return music, found

    def heartbeat(self):
        if self.run:
            # A dedicated lease renewal doesn't select/change the song.
            self.db.rpc('renew_instagram_music_lease', p_slot=self.run['slot'], p_lease=self.run['lease'])

    def configure_once(self, callback, *args, **kwargs):
        if self.configure_started:
            raise RuntimeError('Repeated configure blocked')
        self.stage = 'carousel_configure'
        # Commit publishing intent in the DB BEFORE making the external request.
        self.db.rpc('begin_instagram_music_publish', p_slot=self.run['slot'], p_lease=self.run['lease'])
        self.configure_started = True
        self.event('publish_intent')
        return callback(*args, **kwargs)

    def execute(self, run):
        self.run = run
        self.configure_started = False
        self.receipt = None
        self.failed = False
        name = hashlib.sha256((run['slot'] + run['lease']).encode()).hexdigest()[:24]
        self.attempt = self.state/'attempts'/name
        self.attempt.mkdir(parents=True, mode=0o700, exist_ok=False)
        private_json(self.attempt/'run.json', {'slot':run['slot'], 'carousel_id':run['carousel_id']})
        try:
            self.stage = 'load_carousel'
            carousels = self.db.rows('instagram_carousels', id='eq.'+run['carousel_id'], select='id,title,caption,status')
            if len(carousels) != 1 or carousels[0]['status'] != 'posting':
                raise RuntimeError('Carousel is not claimed')
            carousel = carousels[0]
            items = self.db.rows('instagram_carousel_items', carousel_id='eq.'+carousel['id'],
                                 select='position,posts(storage_path,status,caption)', order='position.asc')
            if len(items) != 5 or any(not i.get('posts') or i['posts']['status'] != 'active' for i in items):
                raise RuntimeError('Five active photos required')
            history = self.db.rows('instagram_carousels', music_track_id='not.is.null', posted_at='not.is.null',
                                   select='music_track_id,posted_at', order='posted_at.desc', limit='100')
            history.reverse()
            with quiet_library():
                c = self.client()
                music, available = self.catalog(c, run.get('music_track_id'))
                if run.get('music_track_id'):
                    track = next(t for t in self.config['tracks'] if t['track_id'] == run['music_track_id'])
                    if history and history[-1]['music_track_id'] == track['track_id']:
                        raise RuntimeError('Consecutive repeat blocked')
                else:
                    text = ' '.join([carousel['title'], *[i['posts'].get('caption') or '' for i in items]])
                    track = choose_track(self.config, available, history, text)
                self.db.rpc('prepare_instagram_music_slot', p_slot=run['slot'], p_lease=run['lease'],
                            p_track=track['track_id'], p_title=track['title'], p_artist=track['artist'])
                self.stage = 'download_photos'
                paths = []
                from urllib.parse import quote
                for item in items:
                    self.heartbeat()
                    url = self.db.url+'/storage/v1/object/public/instagram-posts/'+quote(item['posts']['storage_path'], safe='/')
                    response = requests.get(url, timeout=(10, 30))
                    response.raise_for_status()
                    path = self.attempt/f"slide-{item['position']}.jpg"
                    path.write_bytes(response.content)
                    paths.append(path)
                original = c.photo_rupload
                counter = 0
                def upload(*a, **kw):
                    nonlocal counter
                    counter += 1
                    self.stage = f'photo_upload_{counter}'
                    self.heartbeat()
                    self.event('started')
                    result = original(*a, **kw)
                    self.event('completed')
                    return result
                c.photo_rupload = upload
                def configure(*a, **kw):
                    return self.configure_once(c.album_configure, *a, **kw)
                media = c.album_upload_with_music(paths, carousel['caption'], available[track['track_id']],
                    alacorn_session_id=music['alacorn_session_id'], overlap_duration=self.config['duration_ms'],
                    configure_handler=configure)
                self.receipt = {'media_id':str(media.pk), 'permalink':f'https://www.instagram.com/p/{media.code}/',
                                'track_id':track['track_id'], 'carousel_id':carousel['id'], 'slot':run['slot']}
                self.save_receipt(self.receipt)
                self.stage = 'verify_music'
                verified = False
                try:
                    raw = c.private_request(f'media/{media.pk}/info/')['items'][0]
                    verified = verified_music(raw, track['track_id'])
                except Exception as error:
                    self.event('verification_failed', error_type=type(error).__name__)
                self.stage = 'record_publication'
                self.db.rpc('finish_instagram_music_slot', p_slot=run['slot'], p_lease=run['lease'],
                            p_media=str(media.pk), p_permalink=self.receipt['permalink'], p_verified=verified)
                private_json(self.attempt/'result.json', {**self.receipt, 'music_verified':verified})
                self.save_session(c.get_settings())
                for path in paths:
                    path.unlink(missing_ok=True)
            emit('posted', **self.receipt, music_verified=verified)
            self.failed = not verified
            return {'outcome': 'posted' if verified else 'verification_failed', **self.receipt, 'music_verified': verified}
        except (Exception, KeyboardInterrupt) as error:
            self.failed = True
            kind = type(error).__name__
            self.event('failed', error_type=kind, configure_started=self.configure_started)
            try:
                self.db.rpc('fail_instagram_music_slot', p_slot=run['slot'], p_lease=run['lease'],
                            p_error=f'{self.stage}: {kind}', p_pause=kind in AUTH_ERRORS or self.stage=='account_validation')
            except Exception:
                # Lease expiry marks a publishing run uncertain; never replay it.
                pass
            emit('failed', slot=run['slot'], stage=self.stage, error_type=kind, receipt_saved=bool(self.receipt))
            if isinstance(error, KeyboardInterrupt):
                raise
            return {'outcome': 'publish_uncertain' if self.configure_started else 'failed', 'slot': run['slot'], 'stage': self.stage, 'error_type': kind}
        finally:
            self.run = None

    def health(self):
        with quiet_library():
            c = self.client()
            _, tracks = self.catalog(c)
        cfg = self.db.rows('instagram_schedule', id='eq.true', select='enabled,publisher,timezone,hours')
        if not cfg or 'publisher' not in cfg[0]:
            raise RuntimeError('Music worker migration required')
        result = {'account':os.environ.get('INSTAGRAM_USERNAME','dailyglance'),
                  'available_track_ids':list(tracks), 'schedule':cfg[0]}
        private_json(self.state/'health.json', {'checked_at':now(), **result})
        emit('health_ok', **result)

    def tick(self):
        run = self.db.rpc('claim_instagram_music_slot')
        if run and run.get('lease'):
            return self.execute(run)
        result = run or {'outcome': 'no_claim'}
        emit('skipped', **result)
        return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--health', action='store_true')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    logging.disable(logging.CRITICAL)
    state = Path(os.environ.get('INSTAGRAM_STATE_DIR','/data/instagram'))
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    seed = Path('/etc/secrets/instagram-session.json')
    if not (state/'session.json').exists() and seed.exists():
        private_json(state/'session.json', json.loads(seed.read_text()))
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    with (state/'worker.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            emit('worker_already_running')
            return 1
        try:
            worker = Worker(Database(), state)
            worker.health()
            if args.health:
                return 0
            emit('worker_ready')
            while True:
                try:
                    worker.tick()
                except Exception as error:
                    emit('tick_failed', error_type=type(error).__name__)
                    if args.once:
                        return 1
                if args.once:
                    return 0
                time.sleep(60)
        except KeyboardInterrupt:
            emit('stopped')
            return 0
        except Exception as error:
            emit('failed', error_type=type(error).__name__)
            return 1

if __name__ == '__main__':
    raise SystemExit(main())
