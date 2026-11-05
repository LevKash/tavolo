# Card payments (Viva Wallet, per venue)

Each venue uses its OWN Viva account; money goes straight to the venue. Ordavo
only creates payment orders and reads their status.

## How a payment flows
1. Guest taps **Pay**. `POST /api/pay/session` works out what the table owes (accepted,
   unpaid orders of the open session), writes a `payments` row (`merchant_trns = ordavo:<id>`)
   with the covered orders frozen in `payment_orders`, and opens a Viva checkout.
2. Viva tells us the payment happened in three independent ways. Any one is enough:
   - **Webhook** `/api/webhooks/viva/<venue token>`
   - **Return redirect** `/r?venue=<slug>&s={OrderCode}&t={TransactionId}` (verified on the server)
   - **Reconcile**: every minute a bar screen is open, pending checkouts are checked at Viva
     (needs the venue's API key); the guest's next Pay tap also checks first.
3. Every path re-reads the transaction from Viva with the venue's credentials and settles only
   if: status F, `merchantTrns` is one of ours for THIS venue, currency EUR, amount >= the
   payment, and the transaction id was not used before.
4. Settling marks the covered orders `payment_status = paid`. It does not change kitchen status
   and does not close the table. The bar/staff screens show a PAID badge: staff ring the fiscal
   receipt in their own system and close the table when the final receipt is given.

## Per-venue setup (Settings → Payments)
1. Client ID, Client Secret, Merchant ID, Source Code, **API Key** (required).
2. In Viva: add the webhook URL shown in Settings (event "Transaction Payment Created").
3. In Viva payment source: set the success and failure return URLs shown in Settings.
4. Run "Test connection", then a 1 EUR payment on the demo environment, then switch to Live.

## Platform switch
In-app payment is off everywhere unless `PAYMENTS_LIVE=1` is set on the deployment.

## Alerts (Telegram operator chat)
- Viva transaction carrying our reference but matching no payment
- Payment needing a look: reused transaction, underpaid, closed/declined orders paid, overlap
- Viva rejecting a venue's credentials (payments there are not being recorded)

## Not handled yet
Refunds and chargebacks are not tracked: a payment stays "paid" in Ordavo.

## Tests
`npm test` runs against a throwaway Neon branch named in `.env.test.local`
(the suite refuses to run against the production endpoint). Apply
`docs/2026-11-05-payments.sql` to that branch first.

## Deploying
Apply `docs/2026-11-05-payments.sql` to the target database BEFORE deploying: the app selects
the new columns, so deploying first breaks every page that reads venues or orders.
