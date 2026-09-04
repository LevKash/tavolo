"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminArchiveVenueAction, adminDeleteVenueAction, adminRestoreVenueAction } from "@/lib/actions";

/**
 * Archive (soft delete) / restore / permanent delete controls. Archive only
 * flips the status — the venue stops resolving publicly, all sessions &
 * orders stay in the DB. Permanent delete wipes the venue and every child row.
 */
export default function VenueLifecycle({
  venueId,
  venueName,
  status,
}: {
  venueId: string;
  venueName: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "archive" | "restore" | "delete") {
    const ok = window.confirm(
      kind === "archive"
        ? `Archive "${venueName}"?\n\nOnly the owner sees a locked dashboard and the menu / bar / staff screens stop working. Orders and sessions are kept — you can restore it later.`
        : kind === "restore"
          ? `Restore "${venueName}"?\n\nThe venue becomes active again and its menu goes live at once.`
          : `PERMANENTLY delete "${venueName}"?\n\nThis deletes the venue and ALL of its data — menu, tables, orders, guest sessions, waiter calls and analytics. The owner's account stays. There is NO undo.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    let res: { error?: string; ok?: boolean } | undefined;
    if (kind === "archive") res = await adminArchiveVenueAction(venueId);
    else if (kind === "restore") res = await adminRestoreVenueAction(venueId);
    else res = await adminDeleteVenueAction(venueId);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (kind === "delete") {
      // The venue page no longer exists — bounce to the list.
      router.push("/admin/venues");
      router.refresh();
      return;
    }
    router.refresh();
  }

  const archived = status === "archived";
  const rejected = status === "rejected";

  return (
    <section className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-5">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-danger">
        Danger zone
      </h2>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {archived ? (
          <>
            <p className="text-xs text-fog">
              This venue is <span className="font-bold text-cream">archived</span>{" "}
              — it does not resolve at /m, /bar or /staff. Its data is intact.
            </p>
            <button
              type="button"
              onClick={() => run("restore")}
              disabled={busy}
              className="btn btn-good !px-4 !py-1.5 text-xs font-bold"
            >
              {busy ? "…" : "Restore venue"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-fog">
              Remove this venue from the platform. Soft delete — nothing is
              erased, the venue simply goes offline until restored.
              {rejected && " You can also re-activate a declined application here."}
            </p>
            <div className="flex shrink-0 gap-2">
              {rejected && (
                <button
                  type="button"
                  onClick={() => run("restore")}
                  disabled={busy}
                  className="btn btn-ghost !px-4 !py-1.5 text-xs font-bold"
                >
                  Activate
                </button>
              )}
              <button
                type="button"
                onClick={() => run("archive")}
                disabled={busy}
                className="btn btn-danger !px-4 !py-1.5 text-xs font-bold"
              >
                {busy ? "…" : "Archive venue"}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-danger/20 pt-4">
        <p className="max-w-md text-xs text-fog">
          <span className="font-bold text-danger">Delete forever</span> — wipes
          this venue and every row tied to it: menu, tables, orders, guest
          sessions, analytics. If the owner has no other venues, their account
          is deleted too — the email becomes free for a fresh signup. This
          cannot be undone, so use it only when you want the venue gone for
          good.
        </p>
        <button
          type="button"
          onClick={() => run("delete")}
          disabled={busy}
          className="btn btn-ghost !border-danger/50 !px-4 !py-1.5 text-xs font-bold text-danger hover:!bg-danger/10"
        >
          {busy ? "…" : "Delete permanently"}
        </button>
      </div>
    </section>
  );
}
