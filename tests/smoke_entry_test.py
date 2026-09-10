import json
import io
from contextlib import redirect_stderr
from pathlib import Path
import runpy
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))


class BeforeLaunch(Exception):
    pass


class EntryTest(unittest.TestCase):
    def invoke(self, root, mode, entry):
        script = root / 'scripts/smoke-native.py'
        script.parent.mkdir(exist_ok=True)
        shutil.copyfile(SCRIPTS / 'smoke-native.py', script)
        with patch.object(sys, 'argv', [str(script), '--installation', mode, '--entry', str(entry)]), \
                patch('pty.openpty', side_effect=BeforeLaunch), \
                patch('subprocess.Popen', side_effect=AssertionError('must not launch')):
            runpy.run_path(str(script), run_name='__main__')

    def test_explicit_and_global_configs_target_supplied_artifact(self):
        for mode in ['explicit', 'global']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                entry = root / 'extracted package/dist/index.js'
                entry.parent.mkdir(parents=True)
                entry.write_text('export default {}')
                with self.assertRaises(BeforeLaunch):
                    self.invoke(root, mode, entry)
                out = root / '.superpowers/native-smoke/working'
                config = out / ('config/opencode/tui.json' if mode == 'global' else 'tui.json')
                plugins = json.loads(config.read_text())['plugin']
                target = plugins[0] if mode == 'global' else plugins[0][0]
                self.assertEqual(target, entry.resolve().as_uri() if mode == 'global' else str(entry.resolve()))

    def test_local_entry_rejected_before_config_writes_or_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'tui.json'
            config.write_text('{"plugin":["./dist/index.js"]}')
            entry = root / 'other.js'
            entry.write_text('export default {}')
            with redirect_stderr(io.StringIO()) as stderr, self.assertRaises(SystemExit) as error:
                self.invoke(root, 'local', entry)
            self.assertEqual(error.exception.code, 2)
            self.assertIn('--entry cannot be combined with --installation local', stderr.getvalue())
            self.assertFalse((root / '.superpowers').exists())
            self.assertEqual(config.read_text(), '{"plugin":["./dist/index.js"]}')

    def test_missing_artifact_rejected_before_config_writes_or_launch(self):
        for mode in ['explicit', 'global']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with redirect_stderr(io.StringIO()) as stderr, self.assertRaises(SystemExit) as error:
                    self.invoke(root, mode, root / 'missing.js')
                self.assertEqual(error.exception.code, 2)
                self.assertIn('--entry must name an existing file', stderr.getvalue())
                self.assertFalse((root / '.superpowers').exists())
