# Supladitos Coffee — System Plan

_Last updated: 2026-11-18_

A POS and back-office system for Supladitos Coffee. It starts with one user at one branch, and the data model is ready for multiple branches (up to ~10 users).

---

## 1. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript | Single-page app; no SSR/SEO needed |
| UI | Tailwind CSS + shadcn/ui | Large touch targets for counter use |
| PWA | `vite-plugin-pwa` (Workbox) | Installable; app shell loads offline |
| Offline data | Dexie.js + `dexie-react-hooks` | `useLiveQuery` for reactive local data |
| Online reads | TanStack Query | Fetching and caching from Supabase |
| Backend | Supabase | Postgres, Auth, RLS, Realtime, Edge Functions |
| Hosting | Cloudflare Pages (or Netlify) | Netlify free plan: 300 credits/mo, 15 per production deploy, so batch production deploys |
| Backups | GitHub Action, nightly `pg_dump` | Supabase free tier has no backups |

### Free-tier notes
- **Supabase Free:** 500 MB DB, 2 projects. Projects pause after ~1 week of low activity. Daily shop use keeps production active, but a dev project may pause.
- **No backups on Supabase Free**, so the nightly `pg_dump` job is required.

## Design system
https://claude.ai/artifact/8di46LvNWJrwWbYPEBwfQV

## Pages Design
https://claude.ai/artifact/168FyFTMALcqov5QWmrgQB#page-03174c151310

---

## 2. Offline Strategy

- **App shell:** cached by the service worker (`vite-plugin-pwa`).
- **Menu:** copied into Dexie whenever the app is online. The POS always reads the menu from Dexie.
- **Orders:** written to Dexie first with `sync_status = 'pending'`, then pushed to Supabase (outbox pattern).
- **Order IDs:** UUIDs generated on the device (`crypto.randomUUID()`), so retries never create duplicates.
- **Sync triggers:** `online` event, app start, and a 30–60 s interval.
- **Atomic writes:** order + order items saved through one idempotent Supabase RPC.
- **Server-side check:** the RPC recalculates totals from the menu and flags any mismatch. It never blocks the sale.
- **UI indicator:** e.g. "3 orders waiting to sync".

---

## 3. Data Model

All business tables include `branch_id`. RLS scopes data to the user's branch.

```
branches              id, name, is_active
staff                 id (auth.users), branch_id, role (owner|manager|barista)

categories            id, branch_id, name, sort_order
menu_items            id, category_id, name, description, is_available, sort_order
item_variants         id, menu_item_id, name (Hot | Iced Regular | Iced Upsized), price, sort_order

modifier_groups       id, name (Milk, Add-ons, Sweetness), min_select, max_select,
                      is_required, allow_quantity
modifiers             id, modifier_group_id, name, price_delta, is_available, sort_order
modifier_variant_prices   (optional) modifier_id, variant_name, price_delta override
item_modifier_groups  menu_item_id, modifier_group_id, sort_order

branch_overrides      (future) branch_id, menu_item_id / variant_id, price, is_available

orders                id (uuid), branch_id, order_number, order_type (dine_in|takeout),
                      customer_name, status (new|preparing|done|voided),
                      subtotal, total, void_reason, created_by, created_at,
                      price_mismatch (bool)
order_items           id, order_id, menu_item_id, variant_id,
                      item_name_snapshot, variant_name_snapshot,
                      unit_price, quantity, line_total, notes
order_item_modifiers  id, order_item_id, modifier_id, name_snapshot, price_delta, quantity
payments              id, order_id, method (cash|gcash|maya), amount, amount_received, change_due

day_closes            id, branch_id, business_date, expected_cash, actual_cash,
                      variance, totals_by_method (jsonb), closed_by, closed_at
```

### Design rules
- **Variants hold the base price**: size is a variant, not a modifier.
- **Modifier groups are reusable**: define "Milk" once and attach it to every milk drink.
- **Group rules**: min/max selections, required/optional, whether the same add-on can be picked more than once (e.g. 2× extra shot).
- **Snapshots on order lines**: names and prices are copied at the time of sale, so menu edits never change past sales.

### Seed from the current menu
- **Coffee / Non-Coffee:** variants Hot / Iced Regular / Iced Upsized, each with its own price
- **Pizza:** single-price items (Ham & Cheese, Hawaiian, Pepperoni, Beef & Mushroom)
- **Brewed Iced Tea:** flavours (House Blend, Strawberry, Green Apple)
- **Add-ons:** Oat Milk +30, Extra Shot, Extra Milk

---

## 4. Features (MVP)

### 4.1 POS
- Category tabs → item tiles (text only) → size → modifier chips → cart
- One tap to add items with a single variant and no modifiers
- Cart: change quantity, line notes, dine-in/takeout, optional customer name
- Live price calculation as modifiers are toggled
- Payment: Cash / GCash / Maya. Cash shows the change due
- Works fully offline

### 4.2 Orders
- Status flow: **New → Preparing → Done**
- Queue on the POS screen (no separate bar screen yet)
- Order history: filter by date, status, payment method
- Void with a required reason (no PIN while single-user)

### 4.3 Menu & Pricing Management
- CRUD for categories, items, variants, modifier groups, modifiers
- Sold-out toggle per item/modifier
- Sort order so the most common items come first

### 4.4 Dashboard
- Today / week / month: sales, order count, average order value
- Top items, sales by hour, sales by payment method
- Modifier revenue (oat milk, extra shots, etc.)
- Branch filter (shown only when there's more than one branch)

### 4.5 Day Close
- End-of-day totals by payment method
- Enter actual cash counted → variance recorded

---

## 5. Out of Scope (for now)

| Feature | Reason / Trigger to add |
|---|---|
| Receipts & printing | After BIR registration |
| Discounts (Senior/PWD, manual) | After BIR registration (affects totals and receipts) |
| Menu images | Not needed yet |
| Staff roles UI, manager PIN | When staff are hired |
| Bar/kitchen display | When there's more than one person on shift |
| Branch price overrides UI | When a 2nd branch opens |
| Combos / promos | Later |
| Inventory | Later |

Order lines already store prices at the time of sale, so adding these later won't need a schema rewrite.

---

## 6. Phases

1. **MVP:** schema + RLS + seed, menu management, POS (offline), orders, dashboard, day close, nightly backup
2. **Staff & branches:** roles UI, PIN for voids, branch overrides, bar display
3. **Compliance:** BIR receipts, Senior/PWD discounts, printing
4. **Growth:** combos/promos, inventory deduction per drink

---

## 7. Next Steps

- [ ] Create Supabase project (prod + dev)
- [ ] Write schema migration + RLS policies
- [ ] Write `submit_order` RPC (idempotent upsert + total recalculation)
- [ ] Seed menu from `Menu.pdf`
- [ ] Scaffold React + Vite + PWA + Dexie app
- [ ] Set up nightly `pg_dump` GitHub Action
- [ ] Deploy to Cloudflare Pages
