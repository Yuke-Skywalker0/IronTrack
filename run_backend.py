import os,socket
from pathlib import Path
import uvicorn
from dotenv import load_dotenv
ROOT=Path(__file__).resolve().parent;load_dotenv(ROOT/'.env')
def free_port(start):
    for port in range(start,start+100):
        with socket.socket() as s:
            try:s.bind(('127.0.0.1',port));return port
            except OSError:pass
    raise RuntimeError('Nessuna porta backend disponibile')
port=free_port(int(os.getenv('PORT','8001')))
config=ROOT/'frontend'/'config.js';config.write_text('window.IRONTRACK_CONFIG = { API_BASE_URL: "" };\n',encoding='utf-8')
(ROOT/'.backend_port').write_text(str(port),encoding='utf-8')
print(f'IronTrack API: http://127.0.0.1:{port}')
uvicorn.run('backend.app.main:app',host='127.0.0.1',port=port,reload=False)
