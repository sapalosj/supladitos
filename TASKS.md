# Supladitos Coffee — Task Breakdown

Tracks what is built and what comes next. The plan this is derived from is [supladitos.md](supladitos.md); section numbers (§) point there.

**How to use**

- `[ ]` not started · `[~]` in progress · `[x]` done
- Work top to bottom: milestones are ordered by dependency, and tasks inside a milestone are too.
- When a task is finished, tick it and update the progress table.
- New work goes in as a new numbered task under the milestone it belongs to.

_Last updated: 2026-11-20_

## Progress

| # | Milestone | Done | Status |
|---|---|---|---|
| 0 | Local development setup | 7 / 7 | Done |
| 1 | Database schema, RLS, seed | 12 / 12 | Done |
| 2 | Auth and app shell | 6 / 6 | Done |
| 3 | Offline foundation | 7 / 7 | Done |
| 4 | Menu and pricing management | 7 / 7 | Done |
| 5 | POS | 10 / 10 | Done |
| 6 | Orders | 6 / 6 | Done |
| 7 | Dashboard | 6 / 6 | Done |
| 8 | Day close | 4 / 4 | Done |
| 9 | Production: hosting and backups | 2 / 7 | Next (needs production accounts) |

**Next up:** 9.2 (Supabase projects), then 9.3–9.4 and the backup secrets for 9.5. The repo is public at https://github.com/sapalosj/supladitos.

---

## Phase 1 — MVP

### 0. Local development setup

- [x] 0.1 Scaffold React + Vite + TypeScript app
- [x] 0.2 Add Tailwind CSS, TanStack Query, React Router, Dexie, Supabase client
- [x] 0.3 Add `vite-plugin-pwa` with a web manifest (installable, app shell precached on build)
- [x] 0.4 Local Supabase stack in Docker (Supabase CLI: Postgres, Auth, Realtime, Studio)
- [x] 0.5 Dockerized web dev server (`docker-compose.yml`) and one-command start (`npm run up`)
- [x] 0.6 Apply the design system: colour, type and spacing tokens in `src/index.css`; set up shadcn/ui with those tokens (§1 Design system link)
- [x] 0.7 Real PWA icons (192, 512, maskable) to replace the placeholder SVG

### 1. Database schema, RLS, seed (§3)

- [x] 1.1 Migration: `branches`, `staff` (role: owner | manager | barista)
- [x] 1.2 Migration: `categories`, `menu_items`, `item_variants`
- [x] 1.3 Migration: `modifier_groups`, `modifiers`, `modifier_variant_prices`, `item_modifier_groups`
- [x] 1.4 Migration: `orders`, `order_items`, `order_item_modifiers`, `payments` (with name and price snapshot columns)
- [x] 1.5 Migration: `day_closes`
- [x] 1.6 Migration: `branch_overrides` (table only; UI is Phase 2)
- [x] 1.7 Per-branch `order_number` generation that is safe for orders created offline
- [x] 1.8 RLS policies on every business table, scoped to the user's `branch_id`
- [x] 1.9 `submit_order` RPC: idempotent upsert of order + items + modifiers + payment in one transaction
- [x] 1.10 `submit_order`: recalculate totals from the menu and set `price_mismatch` (never reject the sale)
- [x] 1.11 `supabase/seed.sql`: one branch, one owner login, and the menu from `Menu.pdf` (Coffee / Non-Coffee with Hot, Iced Regular, Iced Upsized; Pizza; Brewed Iced Tea; add-ons)
- [x] 1.12 Generate TypeScript types (`npm run db:types`) and type the Supabase client

> `Menu.pdf` is not in the repo yet. The seed uses the Coffee prices and Hawaiian (240) from the page designs; every other price is marked `PLACEHOLDER` in `supabase/seed.sql` and must be checked against Menu.pdf.
>
> Verify the database with `npm run db:reset && npm run db:smoke`.

### 2. Auth and app shell

- [x] 2.1 Login screen (Supabase Auth, email + password)
- [x] 2.2 Session handling that survives offline starts (stay signed in with no network)
- [x] 2.3 Load the signed-in user's `staff` row (branch and role) into app state
- [x] 2.4 Route guard and app layout with navigation: POS, Orders, Menu, Dashboard, Day Close
- [x] 2.5 Build the page layouts from the Pages Design artifact (§1 Pages Design link)
- [x] 2.6 Online/offline indicator in the layout

> Sign in locally as `owner@supladitos.local` / `supladitos`. The page layouts are shells: tiles, cart, queue, reports and day close totals arrive with their milestones.
>
> Verified in the browser: wrong password message, sign-in, the route guard, sign-out (with a warning when offline or orders are pending), phone and tablet layouts, and an offline start on the production build with both a valid and an expired access token.

### 3. Offline foundation (§2)

- [x] 3.1 Dexie schema: menu cache tables (categories, items, variants, modifier groups, modifiers, links)
- [x] 3.2 Menu sync: copy the menu from Supabase into Dexie whenever the app is online
- [x] 3.3 Dexie schema: orders outbox with `sync_status` (pending | synced | failed)
- [x] 3.4 Sync engine: push pending orders through `submit_order`, with retry
- [x] 3.5 Sync triggers: `online` event, app start, 30–60 s interval
- [x] 3.6 "N orders waiting to sync" indicator (the count is already shown by the connection status from 2.6; confirm it against the real sync engine)
- [x] 3.7 Verify the app shell loads with no network (`npm run build && npm run preview`, then go offline)

> Code: `src/lib/menuSync.ts` (menu copy), `src/lib/orders.ts` (outbox writes, numbering, payload, server→local mapping, `loadOrders`), `src/lib/sync.ts` (engine and triggers), `src/hooks/useSync.ts`. The connection status pill opens sync details with "Sync now" / retry.
>
> Verified in the browser: menu copied into Dexie on sign-in; an order saved offline shows "1 waiting" and syncs once on reconnect (same number, no mismatch); a void made offline reaches the server with its reason; an order the server rejects is marked failed without blocking the rest; the production build reloads offline with the menu.

### 4. Menu and pricing management (§4.3)

- [x] 4.1 Categories: create, edit, delete, sort order
- [x] 4.2 Menu items: create, edit, delete, assign category, sort order
- [x] 4.3 Variants per item with price (Hot / Iced Regular / Iced Upsized or single price)
- [x] 4.4 Modifier groups: min/max select, required, allow quantity
- [x] 4.5 Modifiers: price delta, sort order, optional per-variant price override
- [x] 4.6 Attach modifier groups to items
- [x] 4.7 Sold-out toggle per item and per modifier

> Migration `20261120000100_menu_admin.sql`: `save_menu_item`, `save_modifier_group` (atomic, SECURITY INVOKER so RLS still applies) and `set_sort_order`. Screen: `src/pages/Menu.tsx` with `src/components/menu/*Dialog.tsx`. Writes need a connection and an owner/manager; baristas and offline devices see the menu read-only. Sort order uses up/down buttons. Modifier sold-out is in the group editor.
>
> Verified in the browser: edit a price, add a category and an item, reorder, sold-out toggle on and off, add a modifier with a per-size price, delete a category (its items go with it). `db:smoke` covers the atomic save/rollback and a barista being refused.

### 5. POS (§4.1)

- [x] 5.1 Category tabs and text-only item tiles, read from Dexie
- [x] 5.2 Item flow: pick size (variant), then modifier chips
- [x] 5.3 One-tap add for items with a single variant and no modifiers
- [x] 5.4 Enforce modifier group rules (min/max, required, quantity)
- [x] 5.5 Live price calculation as modifiers are toggled
- [x] 5.6 Cart: change quantity, remove line, line notes
- [x] 5.7 Dine-in / takeout and optional customer name
- [x] 5.8 Payment: Cash / GCash / Maya; cash shows change due
- [x] 5.9 Save the order to Dexie with a device-generated UUID and `sync_status = 'pending'`
- [x] 5.10 Full offline test: take orders with no network, reconnect, confirm they sync once with no duplicates

> Code: `src/pages/Sell.tsx`, `src/components/pos/` (ItemSheet, CartPanel, PaymentPanel), `src/lib/pricing.ts` (selection rules and price), `src/hooks/useCart.tsx` (cart, kept in localStorage per device, cleared on sign-out). Phone: cart and payment are full-screen sheets; tablet: docked cart and a payment dialog. Items with more than one size need the size picked (no default); required single-pick groups start on their first option. Identical lines merge.
>
> Verified in the browser: latte with size, oat milk and 2× extra shot priced live (₱250) and accepted by the server with no mismatch; one-tap pizza; cash change due; edit a cart line; two orders taken offline on a phone (cash and GCash) synced once each on reconnect, numbers kept. Repeated on the production build (service worker, reload while offline). Toasts sit at the top so they never cover View cart / Charge.

### 6. Orders (§4.2)

- [x] 6.1 Order queue on the POS screen
- [x] 6.2 Status flow: New → Preparing → Done
- [x] 6.3 Status changes made offline sync later
- [x] 6.4 Order history with filters: date, status, payment method
- [x] 6.5 Order detail view (lines, modifiers, payment)
- [x] 6.6 Void with a required reason

> Code: `src/pages/Orders.tsx`, `src/components/orders/` (QueueStrip on the tablet POS, OrderDetail with void, orderUi helpers), `src/hooks/useOrders.ts` (server orders for a date range merged with this device's live copy; offline it shows device orders only, with a notice). Queue is oldest first. Status changes and voids go through the outbox (`statusSync`), also for older orders opened from History.
>
> Verified in the browser (phone): an order marked done while offline reached the server on reconnect; History filters by date, status and payment; a void needs a reason and syncs with it.

### 7. Dashboard (§4.4)

- [x] 7.1 Today / week / month: sales, order count, average order value (voided orders excluded)
- [x] 7.2 Top items
- [x] 7.3 Sales by hour
- [x] 7.4 Sales by payment method
- [x] 7.5 Modifier revenue (oat milk, extra shots, …)
- [x] 7.6 Branch filter, shown only when there is more than one branch

> Code: `src/pages/Dashboard.tsx`, `src/lib/reports.ts` (`summarize()` and the periods: today, Monday–today, 1st–today, each compared with the same span one week/month earlier). Figures are computed on the device from `useOrders()`, so they include unsynced sales and still work offline (with a notice that only device orders are counted).
>
> Verified: today's sales, order count, average, payment split, top items and add-on revenue match the same figures computed in SQL, with voided orders left out.
>
> The branch filter lists the branches the account can read. RLS (1.8) limits staff to their own branch, so it stays hidden until Phase 2 gives owners access to more than one branch.

### 8. Day close (§4.5)

- [x] 8.1 End-of-day totals by payment method for the business date
- [x] 8.2 Enter actual cash counted; calculate and store the variance
- [x] 8.3 Save the `day_closes` record; block a second close for the same date
- [x] 8.4 Day close history

> Code: `src/pages/DayClose.tsx`. Totals use the same `summarize()` as Reports (voided orders out, unsynced device orders in, with a warning). Any business date up to today can be closed; closing needs a connection and pushes pending orders first. A closed date shows its record read-only; the unique `(branch_id, business_date)` constraint also blocks a second close on the server.
>
> Verified in the browser: totals match Reports, a ₱20 short variance is shown and stored with the note, the closed day shows read-only and in History, and a second insert for the same date is rejected (23505).

### 9. Production: hosting and backups (§1, §7)

- [x] 9.1 Put the repo on GitHub
- [ ] 9.2 Create Supabase projects (prod and dev) and push migrations
- [ ] 9.3 Create the owner account and seed the production menu
- [ ] 9.4 Deploy to Cloudflare Pages with production env vars
- [~] 9.5 Nightly `pg_dump` GitHub Action
- [x] 9.6 Test a restore from a backup
- [ ] 9.7 Install the PWA on the shop device and run a full day in parallel with the current process

> 9.5: `.github/workflows/backup.yml` + `scripts/backup.sh` (Supabase CLI `db dump`: roles, schema, data), encrypted with `BACKUP_PASSPHRASE` and kept 30 days. The dump and the encrypt/decrypt steps were run locally; the workflow itself first runs once the repo is on GitHub (9.1) with the `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` secrets set. Tick it after the first green run.
>
> 9.6: a local backup was restored with `scripts/restore.sh` into a separate, empty Supabase stack: every table's row count matched, the owner signed in with the same password, RLS still hid everything from anon, and `submit_order` continued the order numbering with correct prices. Steps are in README "Backups". Repeat once with a real production backup after 9.5 runs.

---

## Later phases (not broken down yet)

Break these into tasks when their trigger is reached (§5).

### Phase 2 — Staff and branches
- [ ] Staff roles UI
- [ ] Manager PIN for voids
- [ ] Branch price overrides UI
- [ ] Bar / kitchen display

### Phase 3 — Compliance
- [ ] BIR receipts
- [ ] Senior / PWD and manual discounts
- [ ] Receipt printing

### Phase 4 — Growth
- [ ] Combos and promos
- [ ] Inventory deduction per drink
- [ ] Menu images
