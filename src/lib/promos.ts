/**
 * Promotions shared by the guest screen and the server. No server-only imports
 * here: the guest app bundles this file.
 *
 * Promotions run ONLY at venues with `promos_enabled` (off by default), and the
 * server decides every discount from this table and its own records. A request
 * that merely claims a discount gets none.
 */

/**
 * Pair deals: drink name -> sides that get -10% when ordered together with it.
 * Matched by the item's primary (English) name.
 */
export const PAIR_MAP: Record<string, string[]> = {
  "Ambrosia Sour": ["Truffle Fries", "Olives & Rusks"],
  "Nectar Negroni": ["Truffle Fries", "Pastitsio Croquettes"],
  "Golden Daiquiri": ["Pastitsio Croquettes", "Olives & Rusks"],
  "Espresso Martini": ["Truffle Fries"],
  "Olympic Fizz": ["Olives & Rusks"],
  "Old Fashioned": ["Pastitsio Croquettes"],
  "Xinomavro Naoussa": ["Meze Platter", "Olives & Rusks"],
  "Assyrtiko Santorini": ["Meze Platter"],
  "Virgin Spritz": ["Olives & Rusks"],
};

/** True when `sideName` is a real pair of `drinkName`. */
export function isPairDeal(drinkName: string, sideName: string): boolean {
  return (PAIR_MAP[drinkName] ?? []).includes(sideName);
}

/** The first-order welcome deal must be sent within this long of first opening the menu. */
export const FIRST_ORDER_WINDOW_MS = 5 * 60_000;
/**
 * ...and the table's sitting must itself be this fresh. The sitting is opened by
 * the server when the QR is scanned, so a client cannot claim "I just arrived"
 * at a table that has been open for an hour.
 */
export const FIRST_ORDER_SESSION_MAX_AGE_MS = 10 * 60_000;
