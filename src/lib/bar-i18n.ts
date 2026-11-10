// UI strings for the bar and staff screens (English + Greek) and the language
// switch shared by both. Client-safe: no node-only imports.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { PaymentAlertView } from "@/lib/types";

export type BarLang = "en" | "el";

const LANG_KEY = "ordavo:bar-lang";
const DEFAULT_LANG: BarLang = "el";

const en = {
  // PIN gate
  staffAccess: "STAFF ACCESS",
  venuePin: "Venue PIN",
  unlock: "Unlock",
  askOwner: "Ask the venue owner for the PIN.",
  wrongPin: "That PIN doesn't work for this venue.",

  // connection
  errLocked: "Too many wrong PINs from this device. Retrying shortly…",
  errServer: (status: number) => `Server error (${status}) — retrying…`,
  errNetwork: "Connection problem — retrying…",
  requestFailed: "Request failed",
  connectingBar: "Connecting to the bar…",
  connectingVenue: "Connecting to the venue…",
  differentPin: "Enter a different PIN",
  staleBanner: "No connection — orders are NOT updating",
  lastUpdate: "Last update",

  // header
  barScreen: "Bar screen",
  staffScreen: "Staff screen",
  live: "live",
  offline: "offline",
  today: "Today",
  ordersCount: (n: number): string => (n === 1 ? "order" : "orders"),
  lock: "Lock",
  soundOn: "Sound on",
  soundOff: "Tap to enable sound",
  soundAria: "Sound alerts — tap to test",
  langAria: "Language",
  alertTitle: (n: number) => `🔔 (${n}) New order`,

  // waiter calls
  tablesCalling: (n: number) =>
    n === 1 ? "A table is calling the waiter" : `${n} tables are calling the waiter`,
  resolve: "Resolve",
  resolved: "Resolved ✓",
  callResolved: "Call resolved",
  waiterCalls: "Waiter calls",
  noCalls: "No active calls. Guests ring via the bell on their menu.",

  // awaiting confirmation
  awaitingConfirmation: "Awaiting confirmation",
  awaitingHint: "— first orders of new tables (small venues: confirm here)",
  nothingPending: "Nothing pending.",
  noFirstOrders: "No first orders waiting. New tables show up here for a quick check.",
  firstOrder: "first order",
  confirm: "Confirm",
  confirmedToQueue: "Confirmed → queue",
  confirmGuestsHere: "✓ Confirm — guests are here",
  declineEmptyTable: "✕ Decline — empty table",
  tableConfirmed: "Table confirmed — order in queue",
  declinedClosed: "Declined — session closed",
  wheelOfLuck: "🎡 Wheel of luck",
  menu: "📱 Menu",
  total: "Total",

  // bar queue
  orderQueue: "Order queue",
  barQueue: "Bar queue",
  activeCount: (n: number) => `${n} active`,
  queueEmpty: "Quiet at the bar. 🍸 New confirmed orders will appear here with a chime.",
  statusNew: "In queue",
  statusMaking: "Making…",
  statusServed: "Served ✓",
  wheel: "🎡 wheel",
  paidRingReceipt: "Paid by card · ring the receipt",
  startMaking: "🔥 Start making",
  markServed: "✓ Mark served",
  closeOrder: "Close order",
  movedMaking: "making",
  movedServed: "served",
  movedClosed: "closed",
  orderMoved: (table: string, status: string) => `Order ${table} → ${status}`,

  // open tables
  openTables: "Open tables",
  noOpenTables: "No open tables.",
  noOpenTablesNow: "No open tables right now.",
  toConfirm: (n: number) => `${n} to confirm`,
  awaitingConfirmCount: (n: number) => `${n} awaiting confirm`,
  paidByCard: "paid by card",
  paidByCardRing: "paid by card, ring the receipt",
  opened: (ago: string) => `Opened ${ago}`,
  runningTotal: "Running total",
  closeTable: "Close table",
  tableClosed: "Table closed",
  openTable: "Open table",
  tableOpened: "Table opened",
  openForNoPhones: "Open a table for guests without phones:",
  allQuiet: "All quiet. Orders land here the moment guests send them.",

  // payments that need a human
  demoPayments: "DEMO payments — no real money",
  payAlertsTitle: "Payments that need attention",
  payAlertsOwnerNote: "The owner clears these in the dashboard.",
  payAlertDouble: (refund: string) => `Paid twice. Refund ${refund} to the guest in Viva.`,
  payAlertAfterClose: (amount: string) =>
    `Card payment of ${amount} arrived after the table was closed. Check it was not also paid in cash.`,
  payAlertRefunded: (refunded: string) =>
    `${refunded} was refunded in Viva. Check the bill and issue a credit note.`,
  payAlertUnderpaid: (amount: string) =>
    `Viva received less than the bill (${amount}). Check with the guest.`,
  payAlertOther: (amount: string) => `Payment of ${amount} needs a check in Viva.`,
};

export type BarDict = typeof en;

const el: BarDict = {
  // PIN gate
  staffAccess: "ΠΡΟΣΒΑΣΗ ΠΡΟΣΩΠΙΚΟΥ",
  venuePin: "PIN καταστήματος",
  unlock: "Είσοδος",
  askOwner: "Ζητήστε το PIN από τον υπεύθυνο του καταστήματος.",
  wrongPin: "Λάθος PIN για αυτό το κατάστημα.",

  // connection
  errLocked: "Πολλές λάθος προσπάθειες PIN από αυτή τη συσκευή. Νέα προσπάθεια σε λίγο…",
  errServer: (status) => `Σφάλμα διακομιστή (${status}) — νέα προσπάθεια…`,
  errNetwork: "Πρόβλημα σύνδεσης — νέα προσπάθεια…",
  requestFailed: "Η ενέργεια απέτυχε",
  connectingBar: "Σύνδεση με το μπαρ…",
  connectingVenue: "Σύνδεση με το κατάστημα…",
  differentPin: "Εισαγωγή άλλου PIN",
  staleBanner: "Χωρίς σύνδεση — οι παραγγελίες ΔΕΝ ενημερώνονται",
  lastUpdate: "Τελευταία ενημέρωση",

  // header
  barScreen: "Οθόνη μπαρ",
  staffScreen: "Οθόνη προσωπικού",
  live: "ζωντανά",
  offline: "εκτός σύνδεσης",
  today: "Σήμερα",
  ordersCount: (n) => (n === 1 ? "παραγγελία" : "παραγγελίες"),
  lock: "Κλείδωμα",
  soundOn: "Ήχος ενεργός",
  soundOff: "Πατήστε για ήχο",
  soundAria: "Ηχητικές ειδοποιήσεις — πατήστε για δοκιμή",
  langAria: "Γλώσσα",
  alertTitle: (n) => `🔔 (${n}) Νέα παραγγελία`,

  // waiter calls
  tablesCalling: (n) =>
    n === 1 ? "Ένα τραπέζι καλεί σερβιτόρο" : `${n} τραπέζια καλούν σερβιτόρο`,
  resolve: "Εξυπηρετήθηκε",
  resolved: "Εξυπηρετήθηκε ✓",
  callResolved: "Η κλήση εξυπηρετήθηκε",
  waiterCalls: "Κλήσεις σερβιτόρου",
  noCalls: "Καμία ενεργή κλήση. Οι πελάτες καλούν από το καμπανάκι στο μενού τους.",

  // awaiting confirmation
  awaitingConfirmation: "Προς επιβεβαίωση",
  awaitingHint: "— πρώτες παραγγελίες νέων τραπεζιών (μικρά μαγαζιά: επιβεβαίωση εδώ)",
  nothingPending: "Καμία σε αναμονή.",
  noFirstOrders:
    "Καμία πρώτη παραγγελία σε αναμονή. Τα νέα τραπέζια εμφανίζονται εδώ για γρήγορο έλεγχο.",
  firstOrder: "πρώτη παραγγελία",
  confirm: "Επιβεβαίωση",
  confirmedToQueue: "Επιβεβαιώθηκε → ουρά",
  confirmGuestsHere: "✓ Επιβεβαίωση — οι πελάτες είναι εδώ",
  declineEmptyTable: "✕ Απόρριψη — άδειο τραπέζι",
  tableConfirmed: "Το τραπέζι επιβεβαιώθηκε — η παραγγελία μπήκε στην ουρά",
  declinedClosed: "Απορρίφθηκε — το τραπέζι έκλεισε",
  wheelOfLuck: "🎡 Τροχός της τύχης",
  menu: "📱 Μενού",
  total: "Σύνολο",

  // bar queue
  orderQueue: "Ουρά παραγγελιών",
  barQueue: "Ουρά μπαρ",
  activeCount: (n) => (n === 1 ? "1 ενεργή" : `${n} ενεργές`),
  queueEmpty: "Ησυχία στο μπαρ. 🍸 Οι νέες επιβεβαιωμένες παραγγελίες θα εμφανίζονται εδώ με ήχο.",
  statusNew: "Σε αναμονή",
  statusMaking: "Ετοιμάζεται…",
  statusServed: "Σερβιρίστηκε ✓",
  wheel: "🎡 τροχός",
  paidRingReceipt: "Πληρώθηκε με κάρτα · κόψτε απόδειξη",
  startMaking: "🔥 Έναρξη ετοιμασίας",
  markServed: "✓ Σερβιρίστηκε",
  closeOrder: "Κλείσιμο παραγγελίας",
  movedMaking: "ετοιμάζεται",
  movedServed: "σερβιρίστηκε",
  movedClosed: "έκλεισε",
  orderMoved: (table, status) => `${table} → ${status}`,

  // open tables
  openTables: "Ανοιχτά τραπέζια",
  noOpenTables: "Κανένα ανοιχτό τραπέζι.",
  noOpenTablesNow: "Κανένα ανοιχτό τραπέζι αυτή τη στιγμή.",
  toConfirm: (n) => `${n} προς επιβεβαίωση`,
  awaitingConfirmCount: (n) => `${n} προς επιβεβαίωση`,
  paidByCard: "πληρωμένα με κάρτα",
  paidByCardRing: "πληρωμένα με κάρτα, κόψτε απόδειξη",
  opened: (ago) => `Άνοιξε ${ago}`,
  runningTotal: "Τρέχον σύνολο",
  closeTable: "Κλείσιμο τραπεζιού",
  tableClosed: "Το τραπέζι έκλεισε",
  openTable: "Άνοιγμα τραπεζιού",
  tableOpened: "Το τραπέζι άνοιξε",
  openForNoPhones: "Άνοιγμα τραπεζιού για πελάτες χωρίς κινητό:",
  allQuiet: "Όλα ήσυχα. Οι παραγγελίες εμφανίζονται εδώ μόλις τις στείλουν οι πελάτες.",

  // payments that need a human
  demoPayments: "DEMO πληρωμές — όχι πραγματικά χρήματα",
  payAlertsTitle: "Πληρωμές που θέλουν έλεγχο",
  payAlertsOwnerNote: "Ο υπεύθυνος τις κλείνει από τον πίνακα διαχείρισης.",
  payAlertDouble: (refund) => `Πληρώθηκε δύο φορές. Επιστρέψτε ${refund} στον πελάτη μέσω Viva.`,
  payAlertAfterClose: (amount) =>
    `Πληρωμή με κάρτα ${amount} ήρθε αφού έκλεισε το τραπέζι. Ελέγξτε ότι δεν πληρώθηκε και με μετρητά.`,
  payAlertRefunded: (refunded) =>
    `Επιστράφηκαν ${refunded} μέσω Viva. Ελέγξτε τον λογαριασμό και εκδώστε πιστωτικό.`,
  payAlertUnderpaid: (amount) =>
    `Η Viva έλαβε λιγότερα από τον λογαριασμό (${amount}). Ελέγξτε με τον πελάτη.`,
  payAlertOther: (amount) => `Η πληρωμή ${amount} θέλει έλεγχο στη Viva.`,
};

export const BAR_STRINGS: Record<BarLang, BarDict> = { en, el };

/** One-line explanation of a payment alert, amounts already formatted. */
export function paymentAlertText(
  t: BarDict,
  alert: { kind: PaymentAlertView["kind"]; amount: number; refunded: number },
  fmt: (n: number) => string,
) {
  switch (alert.kind) {
    case "double_payment":
      return t.payAlertDouble(fmt(alert.refunded));
    case "paid_after_close":
      return t.payAlertAfterClose(fmt(alert.amount));
    case "refunded":
      return t.payAlertRefunded(fmt(alert.refunded));
    case "underpaid":
      return t.payAlertUnderpaid(fmt(alert.amount));
    default:
      return t.payAlertOther(fmt(alert.amount));
  }
}

/**
 * Table labels arrive from the server in English ("Table 12", "Bar").
 * For Greek, translate the fixed parts and keep the number/name.
 */
export function tableLabelFor(label: string, lang: BarLang) {
  if (lang !== "el") return label;
  if (/^table\s+/i.test(label)) return label.replace(/^table\s+/i, "Τραπέζι ");
  if (label.toLowerCase() === "bar") return "Μπαρ";
  return label;
}

// --- language store (localStorage + in-page subscribers) ---

const listeners = new Set<() => void>();

function readLang(): BarLang {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === "en" || v === "el" ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// Used when storage is unavailable (private mode), so the toggle still works.
let memoryLang: BarLang | null = null;

function getSnapshot(): BarLang {
  return memoryLang ?? readLang();
}

function getServerSnapshot(): BarLang {
  return DEFAULT_LANG;
}

/**
 * Current UI language for the bar/staff screens. Defaults to Greek; the choice
 * is kept in localStorage. The server render always uses the default, and the
 * stored value is applied right after hydration (no mismatch).
 */
export function useBarLang() {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLang = useCallback((next: BarLang) => {
    memoryLang = next;
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* storage unavailable: keep it for this page only */
    }
    listeners.forEach((l) => l());
  }, []);
  // Tell the browser which language is on screen: with lang="el", CSS uppercase
  // drops Greek accents the way Greek capitals are written, and screen readers
  // pick the right voice.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return { lang, t: BAR_STRINGS[lang], setLang };
}
