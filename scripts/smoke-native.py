#!/usr/bin/env python3
"""Controlled PTY smoke; isolated HOME/XDG, local config, no prompt/model calls."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import termios
import time
from smoke_cleanup import cleanup_proxy, stop_process

parser = argparse.ArgumentParser()
parser.add_argument('--mood', choices=['working', 'thinking'], default='working')
parser.add_argument('--binary', default=str(Path.home() / '.opencode/bin/opencode'))
parser.add_argument('--placement', action='store_true')
parser.add_argument('--final-fix', action='store_true', help='Review geometry/footer regressions with the test-only catalog entry')
parser.add_argument('--activity', action='store_true')
parser.add_argument('--preferences', action='store_true')
parser.add_argument('--restart', action='store_true')
parser.add_argument('--entry', type=Path,
                    help='Load this existing artifact in explicit/global mode; incompatible with local mode, which tests existing project config')
parser.add_argument('--installation', choices=['explicit', 'local', 'global'], default='explicit',
                    help='Test relative project tui.json or isolated global tui.json discovery')
args = parser.parse_args()
if args.final_fix:
    args.placement = True
root = Path(__file__).resolve().parent.parent
if args.entry and args.installation == 'local':
    parser.error('--entry cannot be combined with --installation local: local mode tests existing project tui.json; use --installation global or explicit to select an artifact')
entry = args.entry.resolve() if args.entry else root / 'dist/index.js'
if args.entry and not entry.is_file():
    parser.error(f'--entry must name an existing file: {entry}')
out = root / '.superpowers/native-smoke' / ('final-fix' if args.final_fix else 'preferences' if args.preferences else 'activity' if args.activity else ('placement-' if args.placement else '') + args.mood)
out.mkdir(parents=True, exist_ok=True)
home = out / 'home'
home.mkdir(exist_ok=True)
for name in ['config', 'data', 'cache', 'state', 'tmp']:
    (out / name).mkdir(exist_ok=True)
config = out / 'opencode.json'
config.write_text(json.dumps({'$schema': 'https://opencode.ai/config.json',
    'enabled_providers': [], 'autoupdate': False, 'share': 'disabled', 'plugin': [], 'mcp': {}}))
tui = out / 'tui.json'
tui.write_text(json.dumps({'$schema': 'https://opencode.ai/tui.json', 'theme': 'opencode', 'plugin': [
    *([[str(root / 'tests/fixtures/timer-probe.ts'), {}]] if args.activity or args.preferences else []),
    *([[str(entry), {'mood': args.mood}]] if args.installation == 'explicit' else []),
    [str(root / ('tests/fixtures/final-fix-smoke.tsx' if args.final_fix else 'tests/fixtures/preferences-smoke.tsx' if args.preferences else 'tests/fixtures/activity-smoke.tsx' if args.activity else 'tests/fixtures/placement-smoke.tsx' if args.placement else 'tests/fixtures/native-smoke.tsx')), {'artifacts': str(out), 'mood': args.mood, 'restart': args.restart}],
]}))
result = out / 'result.json'
if result.exists():
    result.unlink()
env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'OPENCODE_TEST_HOME': str(home),
    'TERM': 'xterm-256color', 'COLORTERM': 'truecolor', 'LANG': 'en_US.UTF-8',
    'TMPDIR': str(out / 'tmp'),
    'OPENCODE_CONFIG': str(config), 'OPENCODE_TUI_CONFIG': str(tui),
    'OPENCODE_DISABLE_PROJECT_CONFIG': '1', 'OPENCODE_DISABLE_AUTOUPDATE': '1',
    'OPENCODE_DISABLE_MODELS_FETCH': '1', 'OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER': '1',
    **{f'XDG_{name.upper()}_HOME': str(out / name) for name in ['config', 'data', 'cache', 'state']}}
if args.installation == 'local':
    assert (root / 'tui.json').exists(), 'Create the documented project-local tui.json first'
    env.pop('OPENCODE_DISABLE_PROJECT_CONFIG')
if args.installation == 'global':
    global_config = out / 'config/opencode'
    global_config.mkdir(parents=True, exist_ok=True)
    (global_config / 'tui.json').write_text(json.dumps({'$schema': 'https://opencode.ai/tui.json',
        'plugin': [entry.as_uri()]}))
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 160, 0, 0))
command = [args.binary, '--log-level', 'DEBUG']
proxy = None
if args.placement or args.activity or args.preferences:
    from placement_proxy import start
    for name in ['inject.json', 'pty-request.json', 'pty-ack.json']:
        (out / name).unlink(missing_ok=True)
    proxy = start(args.binary, root, env, out)
    command += ['attach', f'http://127.0.0.1:{proxy[1].server_port}', '--dir', str(root)]
try:
    process = subprocess.Popen(command, cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
except Exception:
    os.close(slave)
    os.close(master)
    if proxy:
        cleanup_proxy(proxy, out, [])
    raise
os.close(slave)
raw = bytearray()
started = time.monotonic()
last_action = None
actions = []
try:
    while time.monotonic() - started < (180 if args.placement or args.activity or args.preferences else 90) and process.poll() is None:
        request = out / 'pty-request.json'
        if (args.placement or args.activity or args.preferences) and request.exists():
            action = json.loads(request.read_text())
            if action['id'] != last_action:
                last_action = action['id']
                if 'resize' in action:
                    width, height = action['resize']
                    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', height, width, 0, 0))
                    os.killpg(process.pid, signal.SIGWINCH)
                if 'input' in action:
                    os.write(master, action['input'].encode())
                actions.append(action)
                (out / 'pty-ack.tmp').write_text(json.dumps({'id': last_action}))
                (out / 'pty-ack.tmp').replace(out / 'pty-ack.json')
        ready, _, _ = select.select([master], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            raw.extend(chunk)
            # Answer terminal color/size/cursor probes; no printable input.
            if b'\x1b]11;?' in chunk:
                os.write(master, b'\x1b]11;rgb:1414/1616/1818\x1b\\')
            if b'\x1b]10;?' in chunk:
                os.write(master, b'\x1b]10;rgb:eeee/eeee/eeee\x1b\\')
            if b'\x1b[6n' in chunk:
                os.write(master, b'\x1b[1;1R')
            if b'\x1b[18t' in chunk:
                os.write(master, b'\x1b[8;50;160t')
        if result.exists():
            break
finally:
    cleanup_errors = []
    try:
        if process.poll() is None:
            try:
                os.write(master, b'\x1b')
                time.sleep(0.1)
                os.write(master, b'\x03\x03')
                process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                pass
            stop_process(process, grace=5)
    except Exception as error:
        cleanup_errors.append(f'TUI cleanup: {error}')
    try:
        os.close(master)
        if proxy:
            cleanup_errors.extend(cleanup_proxy(proxy, out, actions))
    except Exception as error:
        cleanup_errors.append(f'proxy cleanup: {error}')
    (out / 'terminal.ansi').write_bytes(raw)
    (out / 'process.json').write_text(json.dumps({'command': command, 'cwd': str(root),
        'pid': process.pid, 'exit': process.returncode, 'pty': [160, 50], 'bytes': len(raw),
        'elapsedSeconds': round(time.monotonic() - started, 2), 'environment': env,
        'cleanupErrors': cleanup_errors}, indent=2))
if cleanup_errors:
    raise SystemExit(f'Cleanup failed: {cleanup_errors}; inspect {out}')
if not result.exists():
    raise SystemExit(f'No native result; inspect {out}/terminal.ansi and isolated data logs')
report = json.loads(result.read_text())
if args.preferences:
    phase = 'restart' if args.restart else 'configure'
    for name in ['result.json', 'proxy.json', 'process.json', 'terminal.ansi']:
        (out / f'{phase}-{name}').write_bytes((out / name).read_bytes())
    requests = json.loads((out / 'proxy.json').read_text())['requests']
    assert not any(r[0] == 'POST' for r in requests), requests
print(json.dumps(({**{k: v for k, v in report.items() if k != 'observations'},
    'captures': len(report.get('observations', [])), 'report': str(result)} if args.placement or args.activity or args.preferences else report), indent=2))
raise SystemExit(0 if report['ok'] else 1)
