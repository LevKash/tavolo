import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Users who own venues. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  password_hash: text("password_hash").notNull(),
  is_admin: boolean("is_admin").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

/** HttpOnly session tokens (30 days). */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

/** A bar / tavern venue (white-label tenant). */
export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  currency: text("currency").notNull().default("EUR"),
  accent_color: text("accent_color").notNull().default("#c9a45c"),
  logo_url: text("logo_url").notNull().default(""),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  hours: text("hours").notNull().default(""),
  instagram: text("instagram").notNull().default(""),
  wifi_name: text("wifi_name").notNull().default(""),
  wifi_password: text("wifi_password").notNull().default(""),
  bar_pin: text("bar_pin").notNull().default("1234"),
  plan: text("plan").notNull().default("free"),
  is_published: boolean("is_published").notNull().default(true),
  // pending | active | rejected | archived — only active venues resolve publicly.
  // pending = waiting for admin approval, rejected = declined application,
  // archived = soft-deleted by a platform admin (rows/orders/sessions stay intact).
  status: text("status").notNull().default("active"),
  passport_enabled: boolean("passport_enabled").notNull().default(false),
  // --- payments (pay-at-table via the venue's own Viva Wallet merchant) ---
  // Off by default: a venue must paste its own credentials before guests see a Pay button.
  payments_enabled: boolean("payments_enabled").notNull().default(false),
  // demo = Viva demo/sandbox endpoints, live = production.
  viva_env: text("viva_env").notNull().default("demo"),
  viva_client_id: text("viva_client_id").notNull().default(""),
  // NEVER select this column into public/guest payloads.
  viva_client_secret: text("viva_client_secret").notNull().default(""),
  viva_merchant_id: text("viva_merchant_id").notNull().default(""),
  // 4-digit payment source code created in the venue's Viva account.
  viva_source_code: text("viva_source_code").notNull().default(""),
  // Legacy API key (Basic auth). Only used to mint the webhook verification key.
  // NEVER select this column into public/guest payloads.
  viva_api_key: text("viva_api_key").notNull().default(""),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

/** Physical tables (each has its own QR). */
export const tables = pgTable(
  "tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("tables_venue_label_uq").on(t.venue_id, t.label)],
);

/** One guest visit = one open session per table. */
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    table_id: uuid("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("open"), // open | closed
    // Payment state of the whole table session.
    // unpaid = nothing charged yet, pending = order created at Viva,
    // paid = confirmed by webhook/API, failed = attempt rejected, refunded = money returned.
    payment_status: text("payment_status").notNull().default("unpaid"),
    // Viva order code (16-digit, stored as text to stay JS-safe) + transaction id.
    payment_order_code: text("payment_order_code").notNull().default(""),
    payment_transaction_id: text("payment_transaction_id").notNull().default(""),
    // Amount actually charged, frozen at the moment the order was created.
    payment_amount: numeric("payment_amount", { precision: 10, scale: 2, mode: "number" }),
    paid_at: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    opened_at: timestamp("opened_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    closed_at: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    total: numeric("total", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
  },
  (t) => [
    index("table_sessions_table_idx").on(t.table_id, t.status),
    index("table_sessions_venue_idx").on(t.venue_id, t.status),
  ],
);

/** Menu categories. */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    name_alt: text("name_alt").notNull().default(""),
    description: text("description").notNull().default(""),
    description_alt: text("description_alt").notNull().default(""),
    sort_order: integer("sort_order").notNull().default(0),
    is_visible: boolean("is_visible").notNull().default(true),
    // cocktail | zero | food | other — cocktail kind earns passport stamps
    kind: text("kind").notNull().default("other"),
  },
  (t) => [index("categories_venue_idx").on(t.venue_id)],
);

/** Menu items (bilingual, prices in venue currency). */
export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    category_id: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    name_alt: text("name_alt").notNull().default(""),
    description: text("description").notNull().default(""),
    description_alt: text("description_alt").notNull().default(""),
    price: numeric("price", { precision: 10, scale: 2, mode: "number" })
      .notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    allergens: text("allergens").array().notNull().default(sql`'{}'::text[]`),
    image_url: text("image_url").notNull().default(""),
    is_available: boolean("is_available").notNull().default(true),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (t) => [index("menu_items_venue_idx").on(t.venue_id, t.category_id)],
);

/** Guest orders. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    table_id: uuid("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    session_id: uuid("session_id")
      .notNull()
      .references(() => tableSessions.id, { onDelete: "cascade" }),
    // pending_confirm | new | making | served | closed | declined
    status: text("status").notNull().default("pending_confirm"),
    source: text("source").notNull().default("menu"), // menu | wheel
    note: text("note").notNull().default(""),
    total: numeric("total", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    closed_at: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("orders_venue_created_idx").on(t.venue_id, t.created_at),
    index("orders_session_idx").on(t.session_id),
    index("orders_table_idx").on(t.table_id),
  ],
);

/** Frozen line items of an order. */
export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menu_item_id: uuid("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    name_snapshot: text("name_snapshot").notNull(),
    price_snapshot: numeric("price_snapshot", { precision: 10, scale: 2, mode: "number" })
      .notNull(),
    qty: integer("qty").notNull().default(1),
  },
  (t) => [index("order_lines_order_idx").on(t.order_id)],
);

/** Guest "call waiter" requests. */
export const waiterCalls = pgTable(
  "waiter_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    table_id: uuid("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    session_id: uuid("session_id").references(() => tableSessions.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    resolved_at: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("waiter_calls_venue_idx").on(t.venue_id, t.resolved_at)],
);

/** Menu open analytics. */
export const menuViews = pgTable(
  "menu_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    table_id: uuid("table_id").references(() => tables.id, {
      onDelete: "set null",
    }),
    viewed_at: timestamp("viewed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("menu_views_venue_idx").on(t.venue_id, t.viewed_at)],
);

/** Wheel of luck spin analytics. */
export const wheelSpins = pgTable(
  "wheel_spins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    table_id: uuid("table_id").references(() => tables.id, {
      onDelete: "set null",
    }),
    menu_item_id: uuid("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    spun_at: timestamp("spun_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("wheel_spins_venue_idx").on(t.venue_id, t.spun_at)],
);

/** Guest loyalty passport: 1 stamp per cocktail ordered, 10th cocktail free. */
export const cocktailPassports = pgTable(
  "cocktail_passports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venue_id: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    guest_id: uuid("guest_id").notNull(),
    stamps: integer("stamps").notNull().default(0),
    free_served: integer("free_served").notNull().default(0),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cocktail_passports_venue_guest_uq").on(
      t.venue_id,
      t.guest_id,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Table = typeof tables.$inferSelect;
export type TableSession = typeof tableSessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type WaiterCall = typeof waiterCalls.$inferSelect;
export type CocktailPassport = typeof cocktailPassports.$inferSelect;
