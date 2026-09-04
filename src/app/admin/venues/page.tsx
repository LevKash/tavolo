import Link from "next/link";
import {
  countVenuesByStatus,
  isVenueStatus,
  listVenuesForAdmin,
  VENUE_STATUSES,
  type VenueStatus,
} from "@/lib/core";
import { cn } from "@/lib/util";
import { StatusChip } from "../status-chip";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status: VenueStatus | undefined = isVenueStatus(sp.status)
    ? sp.status
    : undefined;

  const [rows, counts] = await Promise.all([
    listVenuesForAdmin({ q, status }),
    countVenuesByStatus(),
  ]);
  const total =
    counts.pending + counts.active + counts.rejected + counts.archived;

  const filterHref = (s?: VenueStatus) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (s) p.set("status", s);
    const qs = p.toString();
    return qs ? `/admin/venues?${qs}` : "/admin/venues";
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="serif text-2xl font-semibold text-cream">Venues</h1>
          <p className="mt-1 text-xs text-fog">
            Every venue on the platform — active, pending, rejected and
            archived. Open one to edit its profile, plan or archive it.
          </p>
        </div>
        <form action="/admin/venues" className="flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, slug or owner email…"
            className="input !py-1.5 w-64 text-xs"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-ghost !px-3 !py-1.5 text-xs">
            Search
          </button>
          {q && (
            <Link
              href={filterHref(status)}
              className="text-xs text-fog hover:text-cream"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Link
          href={filterHref(undefined)}
          className={cn("chip", !status && "chip-active")}
        >
          All · {total}
        </Link>
        {VENUE_STATUSES.map((s) => (
          <Link
            key={s}
            href={filterHref(s)}
            className={cn("chip", status === s && "chip-active")}
          >
            {s} · {counts[s]}
          </Link>
        ))}
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-line bg-ink-2">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line text-[10px] uppercase tracking-widest text-fog-2">
            <tr>
              <th className="px-3 py-2 font-bold">Venue</th>
              <th className="hidden px-3 py-2 font-bold md:table-cell">Owner</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="hidden px-3 py-2 font-bold sm:table-cell">Plan</th>
              <th className="hidden px-3 py-2 font-bold sm:table-cell">Published</th>
              <th className="hidden px-3 py-2 font-bold lg:table-cell">Created</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-fog">
                  No venues match{q ? ` “${q}”` : ""}.
                </td>
              </tr>
            )}
            {rows.map(({ venue: v, owner: o }) => (
              <tr key={v.id} className="hover:bg-white/[0.02]">
                <td className="max-w-[220px] px-3 py-2.5">
                  <Link
                    href={`/admin/venues/${v.id}`}
                    className="block truncate font-semibold text-cream hover:text-gold-2"
                  >
                    {v.name}
                  </Link>
                  <p className="truncate font-mono text-[10px] text-fog-2">
                    /m/{v.slug}
                  </p>
                </td>
                <td className="hidden max-w-[220px] px-3 py-2.5 text-fog md:table-cell">
                  <p className="truncate">{o?.email ?? "—"}</p>
                  <p className="truncate text-[10px] text-fog-2">{o?.name ?? ""}</p>
                </td>
                <td className="px-3 py-2.5">
                  <StatusChip status={v.status} />
                </td>
                <td className="hidden px-3 py-2.5 uppercase text-fog sm:table-cell">
                  {v.plan}
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <span className={v.is_published ? "text-good" : "text-fog-2"}>
                    {v.is_published ? "yes" : "no"}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-fog-2 lg:table-cell">
                  {fmtDate(v.created_at)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={`/admin/venues/${v.id}`}
                    className="whitespace-nowrap font-bold text-gold-2 hover:text-gold-3"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
