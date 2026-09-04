import Link from "next/link";
import { notFound } from "next/navigation";
import { getVenueForAdmin, VENUE_PLANS } from "@/lib/core";
import { ApproveForm, DeclineForm } from "../../review-buttons";
import { StatusChip } from "../../status-chip";
import VenueEditor from "./venue-editor";
import VenueLifecycle from "./venue-lifecycle";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getVenueForAdmin(id);
  if (!row) notFound();
  const { venue: v, owner: o } = row;

  return (
    <>
      <Link
        href="/admin/venues"
        className="text-xs font-semibold text-fog hover:text-cream"
      >
        ← All venues
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="serif truncate text-2xl font-semibold text-cream">
              {v.name}
            </h1>
            <StatusChip status={v.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-fog">ordavo.app/m/{v.slug}</p>
          <p className="mt-1 text-xs text-fog">
            Owner: <span className="text-cream">{o?.name ?? "?"}</span> —{" "}
            {o?.email ?? "?"}
            {o?.is_admin && (
              <span className="ml-1 rounded border border-gold/30 bg-gold/10 px-1 py-px text-[9px] font-bold uppercase text-gold-2">
                admin
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-fog-2">
            created {fmtDate(v.created_at)} · id {v.id}
          </p>
        </div>
        {v.status === "pending" && (
          <div className="flex shrink-0 gap-2">
            <ApproveForm venueId={v.id} venueName={v.name} />
            <DeclineForm venueId={v.id} venueName={v.name} />
          </div>
        )}
      </div>

      <VenueEditor
        venue={{
          id: v.id,
          name: v.name,
          tagline: v.tagline,
          description: v.description,
          address: v.address,
          phone: v.phone,
          hours: v.hours,
          instagram: v.instagram,
          logo_url: v.logo_url,
          accent_color: v.accent_color,
          currency: v.currency,
          plan: v.plan,
          is_published: v.is_published,
        }}
        plans={VENUE_PLANS}
      />

      <VenueLifecycle venueId={v.id} venueName={v.name} status={v.status} />
    </>
  );
}
