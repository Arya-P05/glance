"""One scheduled invocation, with private session persistence in Supabase."""
import argparse
import logging
import os
import tempfile
from pathlib import Path
from worker import Database, Worker, private_json, emit, now

class CloudWorker(Worker):
    def save_session(self, settings):
        # Persist before using refreshed settings in a later ephemeral invocation.
        self.db.request('POST', 'instagram_worker_state',
                        headers={'Prefer': 'resolution=merge-duplicates'},
                        json={'id':'dailyglance', 'session':settings, 'updated_at':now()})
        super().save_session(settings)

    def save_receipt(self, receipt):
        super().save_receipt(receipt)
        # Record the known media immediately, before verification or finalization.
        # A failed write still leaves the publishing intent blocking replays.
        self.db.request('PATCH', 'instagram_schedule_runs',
                        params={'slot':'eq.'+self.run['slot'], 'lease':'eq.'+self.run['lease']},
                        json={'media_id':receipt['media_id']})


def report(result):
    outcome = result['outcome']
    emit('run_result', **result)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as f:
            f.write(f"## Instagram: {outcome}\n\n")
            for key in ('slot', 'permalink', 'music_verified', 'stage', 'error_type'):
                if key in result:
                    f.write(f"- {key}: {result[key]}\n")
    if outcome in {'failed','publish_uncertain','verification_failed','blocked_uncertain',
                   'claim_failed','preparation_expired','missed_window','no_claim'}:
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--health', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    logging.disable(logging.CRITICAL)
    try:
        db = Database()
        if not args.health:
            cfg = db.rows('instagram_schedule', id='eq.true', select='enabled,publisher')
            if not cfg or not cfg[0]['enabled'] or cfg[0]['publisher'] != 'music':
                return report({'outcome': 'inactive' if not cfg or cfg[0]['publisher'] != 'music' else 'paused'})
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            rows = db.rows('instagram_worker_state', id='eq.dailyglance', select='session')
            if len(rows) != 1:
                raise RuntimeError('Session missing')
            private_json(state/'session.json', rows[0]['session'])
            worker = CloudWorker(db, state)
            if args.health:
                worker.health()
                return report({'outcome': 'health_ok'})
            else:
                return report(worker.tick())
        return 0
    except Exception as error:
        return report({'outcome': 'failed', 'error_type': type(error).__name__})

if __name__ == '__main__':
    raise SystemExit(main())
