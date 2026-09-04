"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminArchiveVenueAction, adminRestoreVenueAction } from "@/lib/actions";

/**
 * Archive (soft delete) / restore controls. Archiving only flips the status:
 * the venue stops resolving publicly, all sessions & orders stay in the DB.
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

  async function run(kind: "archive" | "restore") {
    const ok = window.confirm(
      kind === "archive"
        ? `Archive "${venueName}"?\n\nThe menu, bar and staff screens stop working immediately and the owner sees a locked dashboard. Orders and sessions are kept — you can restore it later.`
        : `Restore "${venueName}"?\n\nThe venue becomes active again and its menu goes live at once.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res =
      kind === "archive"
        ? await adminArchiveVenueAction(venueId)
        : await adminRestoreVenueAction(venueId);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
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
    </section>
  );
}
