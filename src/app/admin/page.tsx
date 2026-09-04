import Link from "next/link";
import { asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { users, venues } from "@/db/schema";
import { ApproveForm, DeclineForm } from "./review-buttons";
import { StatusChip } from "./status-chip";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminPage() {
  const pending = await db
    .select()
    .from(venues)
    .where(eq(venues.status, "pending"))
    .orderBy(asc(venues.created_at));

  const decided = await db
    .select()
    .from(venues)
    .where(ne(venues.status, "pending"))
    .orderBy(desc(venues.created_at))
    .limit(8);

  const ownerIds = [
    ...new Set([...pending, ...decided].map((v) => v.owner_id)),
  ];
  const ownerRows =
    ownerIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, ownerIds))
      : [];
  const owner = new Map(ownerRows.map((u) => [u.id, u]));

  return (
    <>
      <h1 className="serif text-2xl font-semibold text-cream">
        Applications
      </h1>
      <p className="mt-1 text-xs text-fog">
        New venues wait here until you approve them — you also get a Telegram
        ping on every signup.
      </p>

      <section className="mt-6 space-y-3">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          Waiting · {pending.length}
        </h2>
        {pending.length === 0 && (
          <p className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-fog">
            Nothing waiting 🎉
          </p>
        )}
        {pending.map((v) => {
          const o = owner.get(v.owner_id);
          return (
            <div
              key={v.id}
              className="rounded-xl border border-line bg-ink-2 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-cream">
                      {v.name}
                    </p>
                    <StatusChip status={v.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-fog">
                    ordavo.app/m/{v.slug}
                  </p>
                  <p className="mt-1 truncate text-xs text-fog">
                    {o?.name ?? "?"} — {o?.email ?? "?"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-fog-2">
                    submitted {fmtDate(v.created_at)}
                    <Link
                      href={`/admin/venues/${v.id}`}
                      className="ml-2 text-gold-2 hover:text-gold-3"
                    >
                      details →
                    </Link>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <ApproveForm venueId={v.id} venueName={v.name} />
                  <DeclineForm venueId={v.id} venueName={v.name} />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-8 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
            Recently reviewed
          </h2>
          <Link
            href="/admin/venues"
            className="text-[10px] font-bold uppercase tracking-widest text-gold-2 hover:text-gold-3"
          >
            All venues →
          </Link>
        </div>
        {decided.length === 0 && (
          <p className="text-xs text-fog-2">Nothing yet.</p>
        )}
        {decided.map((v) => {
          const o = owner.get(v.owner_id);
          return (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line/60 bg-ink-2/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-cream">
                  {v.name}
                  <span className="ml-2 font-normal text-fog-2">
                    {o?.email ?? "?"}
                  </span>
                </p>
                <p className="text-[10px] text-fog-2">
                  {fmtDate(v.created_at)}
                  {v.slug ? ` · /m/${v.slug}` : ""}
                  <Link
                    href={`/admin/venues/${v.id}`}
                    className="ml-2 text-gold-2 hover:text-gold-3"
                  >
                    manage →
                  </Link>
                </p>
              </div>
              <StatusChip status={v.status} />
            </div>
          );
        })}
      </section>
    </>
  );
}
