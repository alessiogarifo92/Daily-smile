## Bootstrap: load the shared skills repo (do this before any work)

This project relies on the private repo `alessiogarifo92/claude-skills` (skills, agents, global rules). A remote session (Claude Code on the web, a cloud container, a GitHub Action) does not have `~/.claude/`, so without this step none of those rules apply.

1. Attach it: `mcp__claude-code-remote__add_repo` with `owner=alessiogarifo92`, `repo=claude-skills` (access `read`), run the clone command it returns, then `register_repo_root`.
2. Run `bash <clone>/scripts/install.sh` (links every skill into `~/.claude/skills`, agents into `~/.claude/agents`, `CLAUDE.md` into `~/.claude/CLAUDE.md`), then check `ls ~/.claude/skills ~/.claude/agents`. If the running session does not pick the agents up, dispatch `general-purpose` with an explicit `model` and the agent file's body pasted into the brief, plus an instruction to load that agent's frontmatter `skills:` with the Skill tool first and to respect its read-only / no-git limits. If a named skill is still missing from the Skill list, Read `<clone>/<skill>/SKILL.md` directly and follow it. Read the clone's `README.md`.
3. New application or project: invoke `project-lifecycle` first, then `autonomous-workflow` to run its phases unattended. An existing backlog or multi-stage goal: `autonomous-workflow`. A single ticket: `product-ownership`.
   Claude Code detects agent files added to an existing `~/.claude/agents/` without a restart, but not when that directory did not exist at session start (typical in a fresh container). Then either restart the session once, or use the fallback above for this session. `templates/session-start-hook.sh` can install everything before the session starts (best effort).
4. If the attach fails, say so in visible text and ask the user how to proceed. Never continue silently without the rules.

Run / preview (manual gate): `cd /home/user/Daily-smile && npm run build && npm run preview` → http://localhost:4173 (PWA only; push needs the Worker). Full stack locally: `npm run build && npx wrangler dev -c worker/wrangler.toml` (needs `worker/.dev.vars`, see README). No per-PR preview deploy yet: in a remote session the gate is parked with screenshots in `docs/test-evidence/` plus these local commands.

Needed environment variables / connectors for this project: Worker secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generate with `node scripts/gen-vapid.mjs`), var `VAPID_SUBJECT` (mailto:) in `worker/wrangler.toml`, D1 database id. No `.mcp.json`.

## Project: Daily Smile

PWA (phone + browser) that every day shows a kind message and a procedurally generated 3D bouquet built from the user's flower/colour preferences, and sends a daily Web Push notification at the time the user picks.

- `shared/` — pure logic used by both sides: date keys per time zone, message of the day, bouquet composition (deterministic per day + preferences), notification scheduling (DST-aware), day-phase theme.
- `web/` — Vite + TypeScript PWA, no framework. `bouquet3d.ts`/`flowers3d.ts` (three.js) render; `composition.ts`, `prefs.ts` are pure and unit-tested. Design: direction **B · Biglietto notturno** (https://claude.ai/artifact/3uE4FdQ9569TMbhCKq51TQ); tokens in `web/src/styles.css`.
- `worker/` — Cloudflare Worker: `/api/*` + static assets from `dist/`, D1 table `subscriptions`, cron every minute sends due pushes.
- Decisions: `docs/decisions.md`.

## Verification (gate before every push)
`npm run verify` = typecheck + unit tests with coverage thresholds + build + Playwright e2e. Run it and read its output before every push; CI runs the same command. The repo is private, so GitHub Actions minutes are finite: if CI cannot start for billing/minutes, follow `test-verification` § "Local verification is the push gate" (run locally, record the evidence on the PR, never disable the workflow).

In the cloud container Chromium is at `/opt/pw-browsers/chromium`; `playwright.config.ts` picks it up automatically. WebGL there is software-rendered (SwiftShader), hence the generous e2e timeout.
