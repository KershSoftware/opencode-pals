"""Local SSE injection for real native permission/question panels; no models.

All REST traffic goes to an isolated real OpenCode server. Only test request
events are added to its event stream. No internal TUI state is patched.
"""
import http.server
import json
import queue
import socket
import subprocess
import threading
import time
import urllib.request
import urllib.error


def start(binary, root, env, out):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    log = (out / 'server.log').open('wb')
    process = subprocess.Popen([binary, 'serve', '--hostname', '127.0.0.1', '--port', str(port)],
                               cwd=root, env=env, stdout=log, stderr=log, start_new_session=True)
    base = f'http://127.0.0.1:{port}'
    for _ in range(200):
        try:
            urllib.request.urlopen(base + '/global/health', timeout=1).close()
            break
        except (OSError, urllib.error.URLError):
            time.sleep(.1)
    requests = []
    injected = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            self.forward()

        def do_POST(self):
            self.forward()

        def do_DELETE(self):
            self.forward()

        def do_PATCH(self):
            self.forward()

        def forward(self):
            requests.append([self.command, self.path])
            # Fail the test instead of allowing any accidental model submission.
            if self.command == 'POST' and self.path.split('?')[0] != '/session':
                self.send_error(403, 'Only empty session creation is allowed in native fixtures')
                return
            body = self.rfile.read(int(self.headers.get('Content-Length', 0))) or None
            headers = {k: v for k, v in self.headers.items() if k.lower() not in ['host', 'connection']}
            req = urllib.request.Request(base + self.path, data=body, headers=headers, method=self.command)
            try:
                response = urllib.request.urlopen(req, timeout=120)
            except urllib.error.HTTPError as error:
                response = error
            self.send_response(response.status)
            self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
            if response.headers.get('Content-Encoding'):
                self.send_header('Content-Encoding', response.headers['Content-Encoding'])
            self.end_headers()
            try:
                if 'text/event-stream' not in response.headers.get('Content-Type', ''):
                    self.wfile.write(response.read())
                    return
                events = queue.Queue()

                def read():
                    try:
                        block = bytearray()
                        while line := response.readline():
                            block.extend(line)
                            if line in [b'\n', b'\r\n']:
                                events.put(bytes(block))
                                block.clear()
                    except (OSError, ValueError, AttributeError):
                        pass

                threading.Thread(target=read, daemon=True).start()
                last = None
                while True:
                    try:
                        self.wfile.write(events.get(timeout=.05))
                        self.wfile.flush()
                    except queue.Empty:
                        pass
                    injection = out / 'inject.json'
                    if injection.exists():
                        data = json.loads(injection.read_text())
                        if data['id'] != last:
                            last = data['id']
                            event = data['event']
                            if '/global/event' in self.path:
                                event = {'directory': str(root), 'payload': event}
                            self.wfile.write(('data: ' + json.dumps(event) + '\n\n').encode())
                            self.wfile.flush()
                            injected.append(data)
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                response.close()

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return process, server, log, requests, injected
