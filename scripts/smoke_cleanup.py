"""Native smoke process cleanup (kept separate so failures can be exercised)."""
import json
import os
import signal
import subprocess


def stop_process(process, grace=10):
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=grace)


def cleanup_proxy(proxy, out, actions):
    process, server, log, requests, injected = proxy
    errors = []
    # Each resource gets its own cleanup attempt, even if another fails.
    for name, close in [('proxy shutdown', server.shutdown), ('proxy close', server.server_close),
                        ('server process', lambda: stop_process(process)), ('server log', log.close)]:
        try:
            close()
        except Exception as error:
            errors.append(f'{name}: {error}')
    (out / 'proxy.json').write_text(json.dumps({'requests': requests, 'injected': injected,
        'serverPID': process.pid, 'serverExit': process.returncode, 'ptyActions': actions,
        'cleanupErrors': errors}, indent=2))
    return errors
