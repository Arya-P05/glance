import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from cloud import CloudWorker

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
