@echo off
setlocal EnableExtensions
cd /d %~dp0
if not exist .venv python -m venv .venv
if exist .backend_port del /q .backend_port
call .venv\Scripts\activate
python -m pip install -r backend\requirements.txt
start "IronTrack" cmd /k "cd /d %~dp0 && call .venv\Scripts\activate && python run_backend.py"
set "BP=8001"
for /l %%i in (1,1,20) do (
  if exist .backend_port set /p BP=<.backend_port
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $env:BP + '/health') -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0} } catch {}; exit 1" >nul 2>&1 && goto OPEN
  timeout /t 1 /nobreak >nul
)
:OPEN
start "" http://127.0.0.1:%BP%
echo.
echo IronTrack avviato: http://127.0.0.1:%BP%
echo API docs: http://127.0.0.1:%BP%/docs
echo Non aprire frontend/index.html direttamente.
echo.
pause
