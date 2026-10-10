# Daily Smile

Ogni giorno un messaggio gentile e un bouquet di fiori in 3D, sempre diverso, composto con i fiori e i colori che preferisci. La notifica arriva all'orario che scegli tu. Funziona dal browser e si installa sul telefono come app (PWA).

## Sviluppo

```bash
cd /home/user/Daily-smile      # o la cartella dove hai clonato il repo
npm install
npm run dev                    # http://localhost:5173 (solo interfaccia)
npm run verify                 # typecheck + unit test + build + e2e (obbligatorio prima di ogni push)
```

## Deploy su Cloudflare (gratuito)

Serve un account Cloudflare. Da eseguire nella cartella del repo, sulla tua macchina:

```bash
npx wrangler login
npx wrangler d1 create daily-smile             # copia il database_id in worker/wrangler.toml
npx wrangler d1 execute daily-smile --remote --file worker/schema.sql
node scripts/gen-vapid.mjs                     # genera le chiavi VAPID
npx wrangler secret put VAPID_PUBLIC_KEY -c worker/wrangler.toml
npx wrangler secret put VAPID_PRIVATE_KEY -c worker/wrangler.toml
# in worker/wrangler.toml imposta VAPID_SUBJECT = "mailto:<tua email>"
npm run worker:deploy                          # build della PWA + deploy di Worker, API e cron
```

Test locale completo (PWA + API, senza cron reale): metti le due chiavi in `worker/.dev.vars` (`VAPID_PUBLIC_KEY=...`, `VAPID_PRIVATE_KEY=...`), poi `npm run build && npx wrangler dev -c worker/wrangler.toml`.

Su iPhone le notifiche funzionano solo dopo **Condividi → Aggiungi alla schermata Home** (iOS 16.4+).
