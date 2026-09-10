import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))


class CleanupTest(unittest.TestCase):
    def test_dead_server_and_shutdown_failure_still_save_artifacts(self):
        from smoke_cleanup import cleanup_proxy
        class BrokenServer:
            closed = False
            def shutdown(self):
                raise RuntimeError('shutdown probe')
            def server_close(self):
                self.closed = True
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            process = subprocess.Popen([sys.executable, '-c', 'pass'], start_new_session=True)
            process.wait()
            server = BrokenServer()
            log = (out / 'server.log').open('wb')
            errors = cleanup_proxy((process, server, log, [['GET', '/event']], []), out, [])
            self.assertTrue(server.closed)
            self.assertTrue(log.closed)
            self.assertIn('shutdown probe', str(errors))
            self.assertEqual(json.loads((out / 'proxy.json').read_text())['serverExit'], 0)

    def test_sigterm_ignoring_process_is_killed_and_reaped(self):
        from smoke_cleanup import stop_process
        process = subprocess.Popen([sys.executable, '-u', '-c',
            'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print("ready", flush=True); time.sleep(60)'],
            stdout=subprocess.PIPE, start_new_session=True)
        try:
            self.assertEqual(process.stdout.readline(), b'ready\n')
            stop_process(process, grace=.05)
            self.assertEqual(process.returncode, -9)
            stop_process(process, grace=.05)  # already exited is harmless
        finally:
            if process.poll() is None:
                process.kill(); process.wait()
            process.stdout.close()


if __name__ == '__main__':
    unittest.main()
