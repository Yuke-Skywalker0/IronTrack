from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os,socket
ROOT=Path(__file__).resolve().parent;root=ROOT/'frontend';os.chdir(root)
def free_port(start):
    for port in range(start,start+100):
        with socket.socket() as s:
            try:s.bind(('127.0.0.1',port));return port
            except OSError:pass
    raise RuntimeError('Nessuna porta frontend disponibile')
port=free_port(int(os.getenv('FRONTEND_PORT','5500')))
backend_port=(ROOT/'.backend_port').read_text(encoding='utf-8').strip() if (ROOT/'.backend_port').exists() else os.getenv('PORT','8001')
(ROOT/'frontend'/'config.js').write_text(f'window.IRONTRACK_CONFIG = {{ API_BASE_URL: \"http://127.0.0.1:{backend_port}\" }};\n',encoding='utf-8')
(ROOT/'.frontend_port').write_text(str(port),encoding='utf-8')
print(f'IronTrack frontend: http://127.0.0.1:{port}')
ThreadingHTTPServer(('127.0.0.1',port),SimpleHTTPRequestHandler).serve_forever()
