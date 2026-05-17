# Toshish Bot

Telegram bot for the Tashkent job market, operating in the Uzbek language. Employers post paid job listings; workers register free and receive daily matching job notifications.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Telegram bot (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env: `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_ID`
- Optional env: `DB_PATH` — path to SQLite file (default: `artifacts/api-server/bot_data.db`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: Telegraf v4 (long polling)
- DB: SQLite via better-sqlite3 (synchronous)
- Scheduler: node-cron (daily 09:00 Tashkent = 04:00 UTC)
- API: Express 5 (health check only)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — all bot logic
  - `constants.ts` — categories, districts, payment card details
  - `db.ts` — SQLite schema + prepared queries
  - `keyboards.ts` — Telegraf keyboard helpers
  - `index.ts` — bot factory, main menus, role handlers
  - `scheduler.ts` — node-cron daily notification job
  - `handlers/employer.ts` — employer register + post job wizard scenes
  - `handlers/worker.ts` — worker register wizard scene
  - `handlers/admin.ts` — /stats, /broadcast, confirm/reject callbacks
- `artifacts/api-server/src/index.ts` — starts Express + bot
- `Dockerfile` — production container for Railway.app
- `railway.json` — Railway deployment config

## Architecture decisions

- **SQLite over Postgres**: self-contained, zero-infrastructure, perfect for single-process Telegram bots. Data file stored at `DB_PATH` (mountable volume on Railway).
- **Long polling over webhooks**: simpler deployment — no public URL or webhook setup required.
- **better-sqlite3 synchronous API**: keeps Telegraf handler code simple and avoids async DB bugs.
- **Custom fields on `ctx.session`** (not `ctx.scene.session`): Telegraf types `scene.session` as `WizardSessionData` only; custom wizard state lives on `ctx.session` which is typed as `BotSession & WizardData`.
- **Scheduler at 04:00 UTC**: corresponds to 09:00 Tashkent time (UTC+5).

## Product

- **Employers (Ish Beruvchi)**: register with name/phone/company, post job listings (category, district, salary, work type, age range, description), pay 5,000 UZS via card and submit screenshot. Admin confirms payment → job goes live for 20 days.
- **Workers (Ishchi)**: register free with name/phone/age, select job categories and preferred districts. Every day at 09:00 AM they receive matching active job listings including employer phone.
- **Admin**: `/stats` for user/job counts, `/broadcast` to all users, inline confirm/reject buttons on payment screenshots.

## User preferences

- Bot language: Uzbek
- Payment card: 5614684702056944 (Nosirjon Karimov) — 5,000 UZS
- Admin ID from `ADMIN_TELEGRAM_ID` secret

## Gotchas

- `better-sqlite3` is a native module — must be in `onlyBuiltDependencies` in `pnpm-workspace.yaml` and listed as `external` in `build.mjs` (already done).
- After editing bot code, the workflow must be restarted to rebuild and reload.
- On Railway: mount a persistent volume at `/data` so `DB_PATH=/data/bot_data.db` survives redeploys.

## Deployment (Railway.app)

1. Push this repo to GitHub
2. Create new Railway project → Deploy from GitHub repo
3. Railway auto-detects `Dockerfile` and `railway.json`
4. Set environment variables in Railway dashboard:
   - `TELEGRAM_BOT_TOKEN`
   - `ADMIN_TELEGRAM_ID`
   - `DB_PATH=/data/bot_data.db`
5. Add a Railway Volume mounted at `/data` for SQLite persistence
