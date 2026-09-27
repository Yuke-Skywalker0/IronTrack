# Deploy IronTrack 2.4

## Opzione consigliata: Render tutto-in-uno

IronTrack può essere pubblicato con un solo Web Service Render: FastAPI serve sia le API sia la PWA. Questo elimina la configurazione frontend separata e riduce i problemi CORS.

1. Crea un repository GitHub e carica il progetto.
2. Su Render crea un **Web Service** collegato al repository.
3. Imposta:
   - Build: `pip install -r backend/requirements.txt`
   - Start: `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
   - Environment: `production`
4. Crea MongoDB Atlas e inserisci `MONGODB_URI`.
5. Imposta `JWT_SECRET` con almeno 32 caratteri casuali.
6. Imposta `ADMIN_PASSWORD` con almeno 10 caratteri e diversa da `123`.
7. Imposta `ADMIN_EMAIL`.
8. Lascia `FRONTEND_ORIGIN` vuoto se usi lo stesso dominio Render per frontend + API; se aggiungi un dominio separato, inserisci l'origine HTTPS del frontend.
9. `frontend/config.js` può rimanere con `API_BASE_URL: ""`: in produzione usa automaticamente l'origine della pagina.
10. Dopo il deploy apri `https://TUO-SERVIZIO.onrender.com/`.

### Variabili consigliate

- `ENVIRONMENT=production`
- `JWT_SECRET=<segreto casuale>`
- `MONGODB_URI=<connection string Atlas>`
- `MONGODB_DB=gymapp`
- `ADMIN_EMAIL=<email admin>`
- `ADMIN_PASSWORD=<password forte>`
- `EXERCISEDB_BASE_URL=https://oss.exercisedb.dev/api/v1`
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` solo se vuoi AI esterna.

**Non inserire mai `AI_API_KEY` nel frontend.**

## Dopo il deploy

Testa nell'ordine:

1. `/health`
2. registrazione di un account di prova
3. login
4. creazione scheda
5. avvio allenamento
6. salvataggio sessione
7. storico e statistiche
8. accesso da un secondo account
9. condivisione/importazione scheda
10. installazione PWA su telefono.

## GitHub Pages

È supportato anche il frontend separato, ma per la prima pubblicazione è preferibile il modello Render tutto-in-uno perché mantiene frontend e API sulla stessa origine.

## Sicurezza produzione

L'app blocca l'avvio in `ENVIRONMENT=production` se mancano `JWT_SECRET` sicuro, `ADMIN_PASSWORD` sicura o `MONGODB_URI`.
