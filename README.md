# Ordavo — QR table ordering for cocktail bars & taverns

A complete white-label SaaS product. Guests scan the QR code on their physical
table, the menu opens instantly on their phone (no login, no app), orders land
on the bar screen, staff confirm & serve, and the owner runs the whole venue
from a dashboard. Every screen reads and writes real data in PostgreSQL —
there is no mock data path.

## Product mechanics

- **Scan to open.** Each table has its own QR pointing to `/m/[slug]?table=<id>`.
  The first paint is the menu. Scanning opens a table session automatically —
  exactly like a waiter opening a POS tab.
- **Anti-fraud confirmation.** The first order of a new session gets status
  `pending_confirm`. Staff see it on their phone screen and **confirm**
  (guests really sit there — the table becomes trusted for the session) or
  **decline** (prank / empty table → order discarded, session closed). The bar
  queue only ever contains confirmed orders; the bartender physically cannot
  start an unconfirmed one.
- **Waiter calls** land on the staff screen *and* the bar screen alert banner.
- **Live status** — guests watch their order go pending → making → served
  (3 s polling). Staff/bar/dashboard screens also poll every 3 s.
- **Wheel of luck** — guests spin for a random available drink (logged as
  analytics), then “Add to order”.

## Stack

- Next.js 16 (App Router) + TypeScript + React
- Tailwind CSS v4 (dark `#0e0d0b` / gold `#c9a45c` theme, glassmorphism)
- PostgreSQL via Drizzle ORM (`pg` driver)
- Server Actions for owner mutations, Route Handlers for the public APIs
- `qrcode` package for QR generation (SVG + PNG)
- No external API keys, no paid services

## Data model

`users`, `sessions` (30-day httpOnly cookie), `venues` (slug, accent, bar_pin,
plan, publish…), `tables`, `table_sessions` (open/closed), `categories` +
`menu_items` (bilingual EN/ΕΛ, price, tags, allergens, sold-out toggle),
`orders` (`pending_confirm | new | making | served | closed | declined`),
`order_lines` (price/name snapshots), `waiter_calls`, `menu_views`,
`wheel_spins`. See `src/db/schema.ts`.

## Pages & screens

| Route | Who | Notes |
|---|---|---|
| `/` | everyone | marketing landing |
| `/signup`, `/login` | owner | signup creates account + venue + tables 1–8 & Bar in one form |
| `/admin/login` | platform admin | separate admin entrance (linked from `/login`); owner credentials are rejected without creating a session |
| `/admin`, `/admin/venues`, `/admin/admins` | platform admin | applications queue, all venues, accounts (promote / demote / delete). Requires `users.is_admin`; the seeded demo owner is **not** an admin — admins are granted from the Accounts tab |
| `/m/[slug]?table=…` | guests | instant bilingual menu, search, cart, live order status, call waiter, wheel of luck |
| `/staff/[slug]` | staff | PIN-gated; confirm/decline first orders, waiter calls, open tables + manual open |
| `/bar/[slug]` | bartender | PIN-gated; queue with chime, grey confirm section, waiter alert banner, open tables, “Today: N · €X” |
| `/dashboard` | owner | Today: revenue, average ticket, top items, by table, open tables (3 s poll) |
| `/dashboard/menu` | owner | bilingual CRUD + reorder + sold-out + tags/allergens |
| `/dashboard/tables` | owner | table CRUD, status, close/open, per-table QR (SVG/PNG) |
| `/dashboard/qr` | owner | venue QR + printable sheet of all table QRs |
| `/dashboard/settings` | owner | venue profile, accent colour, bar PIN, publish toggle |

Public API: `GET /api/menu/[slug]`, `GET /api/qr?slug=&table=&format=svg|png`,
`POST /api/order`, `POST /api/waiter-call`, `POST /api/wheel-spin`,
`GET /api/orders/[id]`, `GET /api/bar/orders?slug=&pin=`, plus
`POST /api/bar/orders/[id]/{status,confirm,decline}` and
`POST /api/bar/tables/[id]/{close,open}` (server-enforced state transitions).

## Local development

```bash
cp .env.example .env   # set DATABASE_URL to your local Postgres
npm install
npx drizzle-kit push   # create the schema (see src/db/schema.ts)
npm run dev
```

The demo venue seeds itself on the first request (`src/lib/seed.ts`), so just
open `http://localhost:3000` and you are ready to click around:

- Guest menu: `/m/ambrosia?table=12`
- Bar screen: `/bar/ambrosia` → PIN `1234`
- Staff screen: `/staff/ambrosia` → PIN `1234`
- Owner dashboard: `demo@ambrosia.gr` / `demo1234`

Seeded live state: Table 3 (first order awaiting confirmation, 2× Aperol
Spritz), Table 12 (order being made — 2× Ambrosia Sour, 1× Truffle Fries —
plus an earlier served order), Table 7 (open, no orders yet), and Table 2
(closed earlier today with paid orders so “Today” is alive).

## Deploy to production (Vercel + Neon)

1. **Create a free Postgres on Neon** — https://neon.tech → “Create a project”.
   Copy the connection string (use the `postgresql://…` pooled or direct URL).
2. **Set the env var.** In Vercel → your project → Settings → Environment
   Variables, add `DATABASE_URL` with the Neon connection string. (Optional:
   `NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app` so printed QR codes use
   the real domain.)
3. **Push the schema.** From your machine, with the Neon URL exported:

   ```bash
   DATABASE_URL="postgresql://…" npx drizzle-kit push
   ```

   (or run it once locally in a CI step / via `vercel build` script if you
   prefer; the app also self-heals — tables are created by `drizzle-kit push`
   only, so do this before first traffic.)
4. **Deploy to Vercel.** Import the repo, framework preset “Next.js”, and
   deploy. The database seeds itself on the very first request
   (`/api/health` → `ensureSeeded()`), so no manual seeding step is needed.

Everything is self-contained: no payment provider, no external APIs, no email
service. Sessions are signed random tokens stored in a `sessions` table with a
30-day httpOnly cookie.

## Validation

```bash
npx next typegen
npm exec tsc -- --noEmit
npm run build
```
