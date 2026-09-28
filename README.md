# IronTrack 2.12 — Personal Gym OS

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


## Autenticazione Google Cloud + recupero password

IronTrack supporta il login con **Google Identity Services**. Il `GOOGLE_CLIENT_ID` è un identificativo pubblico del client web e va configurato sia nel frontend (`frontend/config.js`) sia come variabile `GOOGLE_CLIENT_ID` su Render. Il backend verifica il credential Google prima di creare la propria sessione JWT.

### Google Cloud
1. Google Cloud Console → crea/seleziona il progetto IronTrack.
2. Configura la schermata di consenso OAuth.
3. Crea un OAuth Client ID di tipo **Web application**.
4. Aggiungi come origine autorizzata il dominio pubblico di IronTrack, per esempio `https://irontrack-xxxx.onrender.com`.
5. Copia il Client ID in `frontend/config.js` come `GOOGLE_CLIENT_ID`.
6. Inserisci lo stesso valore nella variabile `GOOGLE_CLIENT_ID` di Render.

### Recupero password
Il reset password nativo IronTrack usa token monouso hashati, scadenza di 30 minuti e invalidazione dopo l'uso. In produzione, per inviare il link, configura **Resend** con `RESEND_API_KEY`, `EMAIL_FROM` e `PUBLIC_BASE_URL`. In sviluppo il token può essere restituito solo come `debug_token`; questa modalità non viene esposta in produzione.

> Google Cloud non deve contenere segreti nel frontend. Il Client ID è pubblico; JWT secret, MongoDB URI, Resend API key e password admin restano esclusivamente nelle variabili segrete di Render.


## UI stack 2.12
- Lucide Icons 0.556.0 for consistent SVG icons.
- Inter for body text and Manrope for display/headings.
- Theme-aware icon styling with graceful fallback if the CDN is unavailable.

## v2.15.0 — Exercise Hub

- Exercise Hub with **Tutti / Preferiti / Recenti / I miei**.
- Favorites, recent exercises and custom exercises are stored locally in the browser.
- Rich exercise detail view with target muscles, secondary muscles, equipment, instructions, tips and variations when available.
- Local curated catalog: **649 additional exercise variants** generated and editorially structured by IronTrack, used to enrich the external ExerciseDB catalog and provide fallback content.
- The current ExerciseDB free V1 source advertises 1,500 exercises; the current ExerciseDB project/repository advertises a broader 11,000+ structured catalog. IronTrack keeps the free source as default and does not hard-code undocumented premium endpoints.
- Add your variables in `backend/.env` using `backend/.env.example` as the template.

### Local setup

```bash
cd backend
copy .env.example .env
```

On macOS/Linux:

```bash
cp backend/.env.example backend/.env
```

Then set a real `JWT_SECRET` and admin password before production use.


## v2.15 — Progression Intelligence
- Workout overview for 7/30 days
- Training volume and consistency metrics
- Training streak
- Estimated 1RM (Epley) per exercise
- RIR overview
- Actionable training insights
- Responsive Progression dashboard

## v2.16 — Training Engine

- Next-session recommendation engine based on recent performance.
- Double-progression guidance with transparent increase / maintain / reduce / start actions.
- Uses recent reps and recorded RIR; no opaque load changes.
- New `GET /api/training-engine` endpoint.
- Progression dashboard now includes a dedicated "Prossimo allenamento" panel.
