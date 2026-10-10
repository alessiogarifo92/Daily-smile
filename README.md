# Daily Smile

Ogni giorno un messaggio gentile e un bouquet di fiori in 3D, sempre diverso, composto con i fiori e i colori che preferisci. La notifica arriva all'orario che scegli tu. Funziona dal browser e si installa sul telefono come app (PWA).

## Sviluppo

```bash
cd /home/user/Daily-smile      # o la cartella dove hai clonato il repo
npm install
npm run dev                    # http://localhost:5173 (solo interfaccia)
npm run verify                 # typecheck + unit test + build + e2e (obbligatorio prima di ogni push)
```

## Deploy su Cloudflare con Workers Builds (gratuito)

Ogni merge su `main` viene pubblicato in automatico da Cloudflare; ogni altro branch ottiene un link di anteprima.

Una tantum, dalla dashboard Cloudflare (https://dash.cloudflare.com):

1. **D1**: *Storage & Databases → D1 → Create* con nome `daily-smile`; (già fatto: il suo *Database ID* è in `worker/wrangler.toml`, non è un segreto).
2. **Worker**: *Workers & Pages → Create → Import a repository* → GitHub → `Daily-smile`, con:
   - Project name: `daily-smile` (deve coincidere con `name` in `worker/wrangler.toml`)
   - Build command: `npm ci && npm run build`
   - Deploy command: `npx wrangler d1 migrations apply DB --remote -c worker/wrangler.toml && npx wrangler deploy -c worker/wrangler.toml`
   - Non-production branch deploy command: `npx wrangler d1 migrations apply DB --remote -c worker/wrangler.toml && npx wrangler versions upload -c worker/wrangler.toml` (le anteprime usano lo stesso database: le migrazioni sono solo additive, quindi è sicuro)
   - Variabile di build `NODE_VERSION` = `22` (anche in `.node-version`)
   - Il token API che Workers Builds crea deve avere il permesso **D1 Edit** (serve per le migrazioni)
   - Production branch: `main`; abilita le build dei branch non di produzione
3. **Segreti**: *Worker → Settings → Variables and Secrets*, tipo **Secret**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (da `node scripts/gen-vapid.mjs`), `VAPID_SUBJECT` (`mailto:<tua email>`).

Rollback: *Worker → Deployments* → versione precedente → *Rollback* (oppure `npx wrangler rollback -c worker/wrangler.toml`). Le migrazioni sono solo additive, quindi una versione precedente funziona sullo stesso database.

Test locale completo (PWA + API, senza cron reale): metti le tre variabili in `worker/.dev.vars`, poi `npm run build && npx wrangler dev -c worker/wrangler.toml`.

Su iPhone le notifiche funzionano solo dopo **Condividi → Aggiungi alla schermata Home** (iOS 16.4+).
