"""Exercise the real PHP/FFmpeg avatar pipeline with a local Auth fixture."""
import base64
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer


class Auth(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"id":"00000000-0000-4000-8000-000000000088"}')

    def log_message(self, *_):
        pass


def free_port():
    server = HTTPServer(('127.0.0.1', 0), Auth)
    return server


auth = free_port()
threading.Thread(target=auth.serve_forever, daemon=True).start()
port_holder = free_port()
port = port_holder.server_port
port_holder.server_close()
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix='mylinks-avatar-test-') as temp:
    root = Path(temp)
    shutil.copy('public/avatar-process.php', root / 'avatar-process.php')
    (root / 'preview-config.php').write_text("<?php return ['url'=>'http://127.0.0.1:" + str(auth.server_port) + "','key'=>'local-test'];")
    with (root / 'php.log').open('w+') as log:
        proc = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', '-t', str(root)], stdout=log, stderr=log)
        url = f'http://127.0.0.1:{port}/avatar-process.php'

        def post(fields, file=None):
            boundary = 'mylinks-avatar-test-boundary'
            body = bytearray()
            for key, value in fields.items():
                body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
            if file:
                name, mime, data = file
                body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode())
                body.extend(data)
                body.extend(b'\r\n')
            body.extend(f'--{boundary}--\r\n'.encode())
            request = urllib.request.Request(url, body, headers={'Authorization': 'Bearer test', 'Content-Type': f'multipart/form-data; boundary={boundary}'})
            with opener.open(request, timeout=90) as response:
                return json.load(response)

        try:
            for _ in range(50):
                try:
                    with opener.open(url + '?action=health', timeout=2) as response:
                        assert json.load(response)['available']
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise AssertionError('PHP avatar server did not start')
            # Two real GIF frames; use FFmpeg to avoid extra image-library dependencies in CI.
            gif_path = root / 'motion.gif'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'tests/fixtures/avatar-master.mp4', '-t', '0.2', str(gif_path)], check=True)
            sources = [('photo.webp', 'image/webp', Path('tests/fixtures/avatar-master.webp').read_bytes()),
                       ('motion.gif', 'image/gif', gif_path.read_bytes()),
                       ('motion.mp4', 'video/mp4', Path('tests/fixtures/avatar-master.mp4').read_bytes())]
            for source in sources:
                prepared = post({'action': 'prepare'}, source)
                result = post({'action': 'render', 'token': prepared['token'], 'x': 0, 'y': 0, 'size': prepared['width'], 'rotation': 0, 'aspect': .8})
                for key, expected in [('delivery', (560, 700)), ('master', (1000, 1250)), ('poster', (560, 700))]:
                    if result[key] is None:
                        assert key == 'poster' and result['kind'] == 'image'
                        continue
                    item = result[key]
                    target = root / (key + ('.mp4' if item['mime'] == 'video/mp4' else '.webp'))
                    target.write_bytes(base64.b64decode(item['data']))
                    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'json', str(target)]))['streams'][0]
                    assert (probe['width'], probe['height']) == expected, (source[0], key, probe)
                    if item['mime'] == 'video/mp4':
                        assert probe['codec_name'] == 'h264', probe
                if result['kind'] == 'video':
                    # Public high-DPR / reduced-motion delivery creates its own master poster.
                    video = root / 'master.mp4'
                    poster = root / 'public-master-poster.webp'
                    code = "define('MYLINKS_AVATAR_LIBRARY_ONLY',true); require $argv[1]; file_put_contents($argv[3],avatar_asset_poster(file_get_contents($argv[2])));"
                    subprocess.run(['php', '-r', code, str(Path('public/avatar-asset.php').resolve()), str(video), str(poster)], check=True)
                    dimensions = subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',str(poster)]).decode().strip()
                    assert dimensions == '1000,1250', dimensions
                post({'action': 'discard', 'token': prepared['token']})
            prepared = post({'action': 'prepare'}, sources[0])
            legacy = post({'action': 'render', 'token': prepared['token'], 'x': 0, 'y': 0, 'size': prepared['width'], 'rotation': 0})
            target = root / 'legacy.webp'
            target.write_bytes(base64.b64decode(legacy['master']['data']))
            dimensions = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', str(target)]).decode().strip()
            assert dimensions == '1000,1000', dimensions
            post({'action': 'discard', 'token': prepared['token']})
            print('Real PHP/FFmpeg: photo, GIF, H.264 video and poster use 560x700/1000x1250, including the public master poster; legacy square preserved')
        except BaseException:
            log.flush()
            print((root / 'php.log').read_text())
            raise
        finally:
            proc.terminate()
            proc.wait(timeout=5)
            auth.shutdown()
