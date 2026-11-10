// JSON-safe shared types crossing the server/client boundary.

export type Lang = "en" | "el";

export type OrderStatus =
  | "pending_confirm"
  | "new"
  | "making"
  | "served"
  | "closed"
  | "declined";

export interface VenuePublic {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  currency: string;
  accentColor: string;
  logoUrl: string;
  address: string;
  phone: string;
  hours: string;
  instagram: string;
  wifiName: string;
  wifiPassword: string;
  published: boolean;
  passportEnabled: boolean;
  /** True when the venue has pay-at-table configured (guest sees a Pay button). */
  paymentsEnabled: boolean;
  /** Pair deals and the first-order welcome deal run only when the venue opted in. */
  promosEnabled: boolean;
}

export interface ItemPublic {
  id: string;
  categoryId: string;
  name: string;
  nameAlt: string;
  description: string;
  descriptionAlt: string;
  price: number;
  tags: string[];
  allergens: string[];
  imageUrl: string;
  isAvailable: boolean;
}

export interface CategoryPublic {
  id: string;
  name: string;
  nameAlt: string;
  description: string;
  descriptionAlt: string;
  kind: string;
  items: ItemPublic[];
}

export interface MenuPublic {
  venue: VenuePublic;
  categories: CategoryPublic[];
}

export interface LinePublic {
  name: string;
  price: number;
  qty: number;
}

export interface OrderView {
  id: string;
  ref: string;
  status: OrderStatus;
  source: "menu" | "wheel";
  note: string;
  total: number;
  createdAt: string;
  closedAt: string | null;
  tableLabel: string;
  lines: LinePublic[];
}

export interface PendingOrderView {
  /** True once a guest payment for this order was verified with Viva. */
  paid?: boolean;
  paidAt?: string | null;
  id: string;
  ref: string;
  tableId: string;
  tableLabel: string;
  source: "menu" | "wheel";
  note: string;
  total: number;
  createdAt: string;
  lines: LinePublic[];
}

export interface QueueOrderView extends PendingOrderView {
  status: Exclude<OrderStatus, "pending_confirm" | "declined" | "closed">;
}

export interface CallView {
  id: string;
  tableId: string;
  tableLabel: string;
  createdAt: string;
}

export interface OpenSessionView {
  id: string;
  tableId: string;
  tableLabel: string;
  openedAt: string;
  total: number;
  /** Part of the table's open orders already paid by card (ring the receipt). */
  paidTotal?: number;
  pendingCount: number;
}

export interface TableInfo {
  id: string;
  label: string;
}

/** A payment a human must look at (double payment, refund, paid after close...). */
export interface PaymentAlertView {
  id: string;
  tableLabel: string;
  /** What happened, as a stable code the screens translate. */
  kind: "double_payment" | "paid_after_close" | "refunded" | "underpaid" | "other";
  /** The amount of the payment, in the venue currency. */
  amount: number;
  /** For refunds: how much went back to the guest. For a double payment: how much to return. */
  refunded: number;
  at: string;
}

export interface BarPayload {
  venue: VenuePublic;
  /** Payments that need a human. Usually empty. */
  paymentAlerts: PaymentAlertView[];
  /** True when card payments run against Viva's DEMO environment: no real money. */
  paymentsDemo: boolean;
  tables: TableInfo[];
  today: { orders: number; revenue: number };
  pending: PendingOrderView[];
  queue: QueueOrderView[];
  openSessions: OpenSessionView[];
  calls: CallView[];
}

export interface DashByTable {
  label: string;
  orders: number;
  revenue: number;
}

export interface DashTopItem {
  name: string;
  qty: number;
  total: number;
}

export interface DashTableRow {
  id: string;
  label: string;
  status: "free" | "open";
  sessionId: string | null;
  openedAt: string | null;
  sessionTotal: number;
}

export interface DashboardDto {
  venue: VenuePublic;
  tables: DashTableRow[];
  today: {
    orders: number;
    revenue: number;
    avgTicket: number;
    spins: number;
    byTable: DashByTable[];
    topItems: DashTopItem[];
  };
  openSessionsCount: number;
  pendingCount: number;
  paymentAlerts: PaymentAlertView[];
  paymentsDemo: boolean;
}

/** Guest loyalty passport snapshot (10th cocktail free). */
export interface PassportView {
  enabled: boolean;
  stamps: number; // lifetime stamps banked at this venue
  progress: number; // stamps into the current round (0..9)
  freeServed: number; // free cocktails already served
  nextFreeIn: number; // cocktails until the next free one
}
