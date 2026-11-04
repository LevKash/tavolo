import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { paymentsAllowed } from "@/lib/site";
import DashVivaSettings, { type VivaSettingsData } from "@/components/dash-viva-settings";

export const dynamic = "force-dynamic";

export default async function VivaSettingsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  const venue = rows[0];
  if (!venue) return null;

  // The secret is never sent to the browser — the form shows a "saved" marker
  // and only writes a new value when the owner types one.
  const data: VivaSettingsData = {
    env: venue.viva_env === "live" ? "live" : "demo",
    clientId: venue.viva_client_id ?? "",
    merchantId: venue.viva_merchant_id ?? "",
    sourceCode: venue.viva_source_code ?? "",
    hasSecret: Boolean(venue.viva_client_secret),
    enabled: Boolean(venue.payments_enabled),
    webhookUrl: "/api/webhooks/viva",
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/dashboard/settings"
        className="text-xs uppercase tracking-[0.18em] text-fog-2 hover:text-cream"
      >
        ← Settings
      </Link>
      <h1 className="serif mt-3 text-3xl font-semibold text-cream">Payments</h1>
      <p className="mt-2 text-sm leading-relaxed text-fog">
        Let guests pay their table from their phone. Money goes straight into your own
        Viva Wallet account — Ordavo never touches the funds and never sees the card.
      </p>
      {!paymentsAllowed() && (
        <p className="mt-4 rounded-lg border border-gold/25 bg-gold/5 p-3 text-xs leading-relaxed text-fog">
          In-app payment is not switched on for the platform yet. You can save your
          Viva details now; guests will not see a Pay button until Ordavo enables it.
        </p>
      )}
      <DashVivaSettings initial={data} />
    </div>
  );
}
