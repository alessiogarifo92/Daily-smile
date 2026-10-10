# Decisioni di progetto

| Fase | Decisione | Perché |
|---|---|---|
| 1. Idea | App giornaliera: messaggio gentile + bouquet diverso ogni giorno, preferenze fiori/colori, orario notifica scelto dall'utente | Richiesta utente |
| 2. Forma e costi | **PWA + push server** (scelta utente). Hosting e API su Cloudflare Workers + D1 + Cron (free tier) | Una sola codebase per telefono e browser, niente store; 0 € oggi e a 10x utenti (Workers 100k req/giorno, D1 5M letture/giorno, cron incluso) |
| 2. Librerie | three.js (MIT), @block65/webcrypto-web-push (MIT, RFC 8291/8292, compatibile Apple), @fontsource Caveat/Karla (OFL) | Gratuite, licenze permissive, nessun servizio esterno |
| 3. Architettura | Logica pura in `shared/` riusata da PWA e Worker; nessun account: preferenze sul dispositivo, al server solo sottoscrizione push + orario + fuso | Minimo dato personale; il server sa solo quando notificare |
| 3. Sicurezza | Endpoint push accettati solo da FCM/Mozilla/Apple/Windows; body ≤ 4 KB; validazione campi | Impedisce di usare il Worker per chiamare host arbitrari |
| 3.5 Design | Direzione **B · Biglietto notturno** (canvas https://claude.ai/artifact/3uE4FdQ9569TMbhCKq51TQ) | Scelta utente |
| 3.5 Fiori | Fiori **3D procedurali** (three.js) invece di modelli scaricati | I modelli realistici open source pesano MB, sono spesso CC-BY e non sono ricolorabili; quelli procedurali seguono i colori scelti e non hanno vincoli di licenza |
| 3.5 Tema | Sfondo automatico per ora di accesso: mattina 5–12 chiaro, pomeriggio 12–18 chiaro caldo, sera 18–21 tramonto, notte 21–5 blu notte; override Chiaro/Scuro | Richiesta utente |
| Test | `npm run verify` locale prima di ogni push; CI esegue lo stesso comando su ogni push e PR | Repo reso pubblico: minuti Actions gratuiti; se tornasse privato vale la regola globale in `test-verification` |
| Worker | Al massimo 3 notifiche per esecuzione del cron (≈4.300 al giorno), le altre il minuto dopo | Piano Free: ~10 ms di CPU per invocazione, ~3 ms per notifica (misurato). Per crescere: piano Paid (5 $/mese) e lotto più grande |
| Deploy | Workers Builds: `main` → produzione, altri branch → anteprima; migrazioni applicate da entrambi (solo additive); log con Observability; Node 22 | Audit pre-deploy (`release-auditor`) |
| Sicurezza (audit pre-deploy) | Iscrizioni scartate dopo 3 fallimenti o subito se il push service le rifiuta; chiavi validate in byte; solo `application/json`; limite per IPv6 /64; 503 senza rate limiter; 413 prima di leggere body grandi; click notifica solo su questo sito | Evita che iscrizioni spazzatura ritardino quelle vere o esauriscano la quota D1 gratuita |
| Rischio accettato | Gli URL di anteprima dei branch usano lo stesso D1 e gli stessi segreti della produzione | App hobby senza dati sensibili; build solo dei branch del repo, non dei fork |

Palette B: notte `#1F2340`, superficie `#2C3158`, carta `#FBEFE6`, inchiostro `#2A2440`, corallo `#FF7A59`, firma `#A33A5E`. Font: Caveat (titoli, messaggio), Karla (testo).
