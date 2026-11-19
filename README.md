# Supladitos Coffee

An offline-first point of sale and back office for a small coffee shop in the Philippines. The counter keeps selling when the internet drops; every sale syncs once the connection is back, with no duplicates and no lost orders.

Built as an installable PWA for a phone or a tablet at the counter, on React, Dexie (IndexedDB) and Supabase (Postgres, Auth, row level security).

![The POS on a tablet: menu tiles, the order queue and the cart](docs/screenshots/pos-tablet.png)

| Sell | Item options | Payment | Orders |
|---|---|---|---|
| ![Menu tiles on a phone](docs/screenshots/pos-phone.png) | ![Size, milk, add-ons and sweetness for a Spanish latte](docs/screenshots/item-options.png) | ![Cash payment with change due](docs/screenshots/payment.png) | ![Order queue: New, Preparing, Done](docs/screenshots/orders-queue.png) |

| Menu & pricing | Reports | Day close |
|---|---|---|
| ![Menu editor with sold-out toggles](docs/screenshots/menu.png) | ![Sales, orders, sales by hour and payment split](docs/screenshots/reports.png) | ![End-of-day totals and cash variance](docs/screenshots/day-close.png) |

## Features

- **POS:** category tiles, sizes as variants (Hot / Iced Regular / Iced Upsized), reusable modifier groups with min/max rules and quantities (2× extra shot), per-size modifier prices, live pricing, line notes, dine-in or takeout, Cash / GCash / Maya with change due. Single-price items add in one tap.
- **Works offline:** the menu lives on the device, sales go to a local outbox, order numbers are picked on the device. The app shell loads with no network.
- **Orders:** a New → Preparing → Done queue (on the POS screen on tablets), history filtered by date, status and payment, and voids with a required reason. Status changes made offline sync later.
- **Menu management:** categories, items, sizes, modifier groups and options, sort order, and sold-out toggles, for owners and managers.
- **Reports:** today / week / month sales, order count, average order, sales by hour, payment split, top items and add-on revenue, compared with the previous period.
- **Day close:** totals by payment method, expected vs counted cash, the variance recorded once per business day.
- **Backups:** a nightly, encrypted database dump (Supabase's free tier has none), with a tested restore.

## How the offline part works

```mermaid
flowchart LR
  subgraph Device
    POS[POS screen] -->|reads| Menu[(Menu cache<br/>Dexie)]
    POS -->|writes sale, syncStatus=pending| Outbox[(Orders outbox<br/>Dexie)]
    Engine[Sync engine]
  end
  Outbox --> Engine
  Engine -->|submit_order RPC, retried| DB[(Supabase Postgres<br/>RLS per branch)]
  DB -->|menu + today's orders| Engine
  Engine --> Menu
```

- **The device is the source of a sale.** Each order gets a UUID made on the device (`crypto.randomUUID()`) and is saved locally first. The UI never waits for the network.
- **Idempotent writes.** `submit_order` saves the order, its lines, modifiers and payment in one transaction and returns the stored result if the same order arrives twice, so retries can't duplicate a sale.
- **Prices are checked, never blocking.** The server recalculates every line from the menu. A difference is stored as `price_mismatch` for review; the sale is kept as charged.
- **Order numbers work offline.** The device numbers orders from what it has seen; if another device used the number meanwhile, the server assigns the next free one and the device updates.
- **Sync triggers:** app start, the `online` event, every 30 seconds, and right after each sale. One run at a time, across tabs too (Web Locks). Network errors retry straight away; orders the server rejects are marked failed, kept, and retried slowly.
- **Row level security on every table.** Staff only see their own branch, the menu is writable by owners and managers only, and orders can only be created through the RPC.

## Tech stack

React 19, Vite, TypeScript, Tailwind CSS and shadcn/ui, TanStack Query, Dexie and `dexie-react-hooks`, `vite-plugin-pwa` (Workbox), Supabase (Postgres 17, Auth, RLS, RPCs in PL/pgSQL), Docker for local development, GitHub Actions for backups.

## Project status

The MVP (POS, orders, menu management, reports, day close, offline sync, backups) is built and tested locally. Production hosting is next. Progress is tracked in [TASKS.md](TASKS.md); the plan behind it is [supladitos.md](supladitos.md).

## Local development

Everything runs in Docker. You need Docker Desktop and Node 20.19+ on the host (Node is only used to run the Supabase CLI and npm scripts).

```bash
npm install     # once: installs the Supabase CLI and editor types
npm run up      # starts Supabase + the web dev server
```

| What | URL |
|---|---|
| App (Vite dev server) | http://localhost:5180 |
| Supabase Studio (DB UI) | http://localhost:44323 |
| Supabase API | http://localhost:44321 |
| Postgres | `postgresql://postgres:postgres@localhost:44322/postgres` |
| Mailpit (auth emails) | http://localhost:44324 |

The first `npm run up` downloads the Supabase images and takes several minutes.

### Commands

| Command | What it does |
|---|---|
| `npm run up` | Start Supabase, write `.env.local`, start the web container |
| `npm run down` | Stop everything (database data is kept) |
| `npm run logs` | Follow the web container logs |
| `npm run db:migration <name>` | Create a new migration file in `supabase/migrations` |
| `npm run db:reset` | Rebuild the local database from migrations + `supabase/seed.sql` |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local database |
| `npm run db:smoke` | Database checks: auth, RLS, `submit_order`, menu RPCs (run right after `db:reset`) |
| `npm run typecheck` | Type-check the app |
| `npm run build && npm run preview` | Production build on http://localhost:5181 (use this to test the service worker and offline) |

### Notes

- After adding an npm package, restart the web container so it installs it: `docker compose restart web`.
- The service worker is disabled in the dev server; offline behaviour is tested against the production build.
- `.env.local` is generated by `npm run env:local` and is not committed.
- Local login: `owner@supladitos.local` / `supladitos` (from `supabase/seed.sql`).
- Supabase uses ports 44320–44329, not the CLI's default 543xx. On Windows/WSL, Hyper-V reserves port ranges in the 49152+ dynamic range (check with `netsh interface ipv4 show excludedportrange protocol=tcp`), and 54321–54329 were inside one.

## Backups

`.github/workflows/backup.yml` dumps the production database every night (02:00 Manila), encrypts it and keeps it as a workflow artifact for 30 days. It needs the `SUPABASE_DB_URL` (Session pooler URL) and `BACKUP_PASSPHRASE` repository secrets; see the comments at the top of the file.

To restore:

1. Download the artifact from the workflow run and decrypt it:
   `gpg -d supladitos-<stamp>.tar.gz.gpg | tar -xz` (asks for `BACKUP_PASSPHRASE`).
2. Create a **new, empty** Supabase project (don't push migrations to it; the backup holds the schema).
3. `scripts/restore.sh "<new project's Session pooler URL>" <stamp>/`. It runs in one transaction, so a failure leaves the project empty.
4. Point the app's `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` at the new project. Staff sign in with their existing passwords.

`scripts/backup.sh` with no arguments dumps the local stack, the same way. Backup folders (`backup/`) are git-ignored: they contain password hashes.

## Layout

```
src/                 React app
  App.tsx            Routes: /login, then the guarded app (/, /orders, /menu, /dashboard, /day-close)
  components/layout/ App layout (bottom bar on phones, rail on tablets), route guard, connection status
  components/pos/    Item options sheet, cart, payment
  components/orders/ Queue strip, order detail and void
  components/menu/   Menu editors (category, item, modifier group)
  pages/             One file per screen
  hooks/             useMenu (menu from Dexie), useCart, useOrders (server + device orders), useSync
  lib/auth.tsx       Sign-in and the cached staff profile (works offline)
  lib/supabase.ts    Supabase client
  lib/db.ts          Dexie (offline) database
  lib/sync.ts        Sync engine: outbox push, status changes, today's orders and menu pull
  lib/orders.ts      Saving sales offline, order numbers, the submit_order payload
  lib/pricing.ts     Modifier rules and line prices
  lib/reports.ts     Report and day-close figures
supabase/            Local Supabase config, migrations, seed
scripts/             db-smoke (database checks), backup.sh / restore.sh
.github/workflows/   Nightly backup
docker-compose.yml   Web dev server container
Dockerfile.dev
```
