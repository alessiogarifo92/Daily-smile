# Daily Smile

Ogni giorno un messaggio gentile e un bouquet di fiori in 3D, sempre diverso, composto con i fiori e i colori che preferisci. La notifica arriva all'orario che scegli tu. Funziona dal browser e si installa sul telefono come app (PWA).

## Sviluppo

```bash
cd /home/user/Daily-smile      # o la cartella dove hai clonato il repo
npm install
npm run dev                    # http://localhost:5173 (solo interfaccia)
npm run verify                 # typecheck + unit test + build + e2e (obbligatorio prima di ogni push)
```

## Deploy su Cloudflare (automatico da GitHub Actions, gratuito)

Il job `deploy` in `.github/workflows/ci.yml` parte dopo che `npm run verify` è verde, solo sui push in questo repo:
- push su `main` → **produzione** (`https://daily-smile.<tuo-sottodominio>.workers.dev`);
- push su un altro branch → **anteprima** con un suo URL, la produzione non cambia;
- il primo deploy crea il Worker e genera le chiavi VAPID dentro il runner, salvandole come segreti del Worker (nessuno le vede).

Configurazione una tantum, tutta dal browser (anche da telefono):
1. Cloudflare → *My Profile → API Tokens → Create Token* → template **Edit Cloudflare Workers**, aggiungi il permesso **Account → D1 → Edit**, limita all'account; crea e copia il token.
2. GitHub → repo → *Settings → Secrets and variables → Actions → New repository secret*: `CLOUDFLARE_API_TOKEN` (l'Account ID è già in `worker/wrangler.toml`). Non condividere il token altrove.
3. Rilancia l'ultima esecuzione di *CI* (o fai un push): il riepilogo del job `deploy` mostra l'URL e il risultato dello smoke test (`scripts/smoke.sh`).

Il database D1 `daily-smile` esiste già (ID in `worker/wrangler.toml`). Le migrazioni in `worker/migrations/` sono solo additive e vengono applicate a ogni deploy.

Rollback: *Worker → Deployments* → versione precedente → *Rollback* (oppure `npx wrangler rollback -c worker/wrangler.toml`). Le migrazioni sono solo additive, quindi una versione precedente funziona sullo stesso database.

Test locale completo (PWA + API, senza cron reale): `node scripts/gen-vapid.mjs > worker/.dev.vars`, aggiungi `VAPID_SUBJECT=https://github.com/alessiogarifo92/Daily-smile`, poi `npm run build && npx wrangler d1 migrations apply DB --local -c worker/wrangler.toml && npx wrangler dev -c worker/wrangler.toml` e `bash scripts/smoke.sh http://localhost:8787`.

Su iPhone le notifiche funzionano solo dopo **Condividi → Aggiungi alla schermata Home** (iOS 16.4+).
