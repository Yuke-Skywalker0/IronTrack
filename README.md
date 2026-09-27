# IronTrack 2.4 — Personal Gym OS

App PWA mobile-first per allenamento personale, amici e profili gestiti dal Super Admin.

## Cosa include
- FastAPI + JWT + SQLite locale / MongoDB Atlas in produzione
- Super Admin e profili figli
- CRUD completo delle schede, giorni, cartelle, duplicazione
- Builder con libreria ExerciseDB e dettaglio esercizio
- Ricerca + filtri corpo/attrezzatura quando disponibili dalla sorgente
- GIF/immagini/video/istruzioni quando presenti nella risposta ExerciseDB
- Live workout con serie, kg, reps, RIR, note e timer
- Storico allenamenti con dettaglio di ogni serie
- Ripresa automatica dell’allenamento dopo chiusura/refresh
- Suggerimenti di carico basati sulle ultime prestazioni
- PR/best weight ed esercizi principali
- Grafico del volume nel tempo e storico per singolo esercizio
- Misure corporee con storico
- Condivisione schede tramite codice e importazione
- Gestione schede del Super Admin sui profili figli
- AI Workout Builder con fallback locale e provider OpenAI-compatible opzionale
- Tema chiaro/scuro/sistema e colore accent personalizzabile
- PWA installabile
- Deploy frontend su GitHub Pages e backend su Render

## Avvio Windows — consigliato
Dalla cartella principale:
```bat
start_local.bat
```
Il launcher crea `.venv`, installa i requirements, sceglie una porta libera per il backend che serve anche il frontend, aggiorna `frontend/config.js` e apre direttamente IronTrack. Non aprire `frontend/index.html` con doppio clic.

### Avvio manuale
Backend:
```bat
python run_backend.py
```
Frontend, in una seconda finestra:
```bat
python run_frontend.py
```
Poi apri l'URL stampato dal launcher, normalmente `http://127.0.0.1:5500`.

API docs: `http://127.0.0.1:PORT/docs`
Health: `http://127.0.0.1:PORT/health`

## Login iniziale
```text
Email: luca@mail.com
Password: 123
```
Cambia la password prima di pubblicare l'istanza.

## ExerciseDB
La sorgente predefinita è ExerciseDB V1:
`https://oss.exercisedb.dev/api/v1`

La pagina ufficiale attuale indica la V1 gratuita con 1.500 esercizi e GIF, senza registrazione/API key. L'API completa moderna ExerciseDB pubblica invece un catalogo molto più ampio e il repository ufficiale è AGPL-3.0. Rispetta sempre termini, licenza e limiti della sorgente scelta.

## AI
Nessuna chiave è inclusa.
Compila nel `.env` locale oppure nelle variabili Render:
```env
AI_BASE_URL=https://TUO-PROVIDER/v1
AI_API_KEY=...
AI_MODEL=...
```
Il backend invia la chiave solo server-side.

## MongoDB
Lascia `MONGODB_URI=` vuoto per SQLite locale. Per produzione configura:
```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB=gymapp
```

## Render
`render.yaml` è già incluso. Il backend avvia:
```bash
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT
```
Imposta `JWT_SECRET`, `MONGODB_URI`, `FRONTEND_ORIGIN`, eventuali variabili AI e `ADMIN_PASSWORD` nei secrets di Render.

## GitHub Pages
Pubblica la cartella `frontend/` come sito statico. Prima del deploy di produzione, modifica `frontend/config.js` con l'URL HTTPS del backend Render. Non mettere mai `AI_API_KEY` nel frontend.

## Struttura
```text
irontrack/
├─ backend/app/main.py
├─ backend/app/db.py
├─ backend/app/security.py
├─ frontend/index.html
├─ frontend/app.js
├─ frontend/styles.css
├─ frontend/config.js
├─ render.yaml
├─ run_backend.py
├─ run_frontend.py
└─ start_local.bat
```
