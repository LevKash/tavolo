"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  closeTableAction,
  deleteTableAction,
  openTableAction,
  saveTableAction,
} from "@/lib/actions";
import type { DashTableRow } from "@/lib/types";
import { cn, clock, money, timeAgo } from "@/lib/util";

export default function DashTables(props: {
  slug: string;
  tables: DashTableRow[];
}) {
  const router = useRouter();
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<{ error?: string } | undefined>, id: string) {
    setBusy(id);
    setError("");
    const res = await fn();
    setBusy(null);
    if (res?.error) {
      setError(res.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function addTable() {
    const label = newLabel.trim();
    if (!label) return;
    const ok = await run(() => saveTableAction({ label }), "new");
    if (ok) setNewLabel("");
  }

  const qrUrl = (tableId: string, fmt: string, size = 380) =>
    `/api/qr?slug=${encodeURIComponent(props.slug)}&table=${tableId}&format=${fmt}&size=${size}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="serif text-3xl font-semibold text-cream">Tables & QR</h1>
        <p className="mt-1 text-sm text-fog">
          Each table has its own QR code pointing to{" "}
          <span className="text-gold-2">/m/{props.slug}?table=…</span>
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {props.tables.map((tb) => (
          <div key={tb.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editing === tb.id ? (
                  <input
                    className="input !py-1 text-sm"
                    value={editLabel}
                    autoFocus
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        await run(() => saveTableAction({ id: tb.id, label: editLabel }), tb.id);
                        setEditing(null);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <p className="text-lg font-extrabold text-cream">{tb.label}</p>
                )}
                {tb.status === "open" ? (
                  <p className="mt-0.5 text-xs text-fog">
                    Open since <span className="font-bold text-gold-2">{tb.openedAt ? clock(tb.openedAt) : ""}</span>{" "}
                    ({tb.openedAt ? timeAgo(tb.openedAt) : ""}) · Total{" "}
                    <span className="font-bold text-gold-2">{money(tb.sessionTotal)}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-fog-2">Free — awaiting guests</p>
                )}
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                  tb.status === "open" ? "bg-good/15 text-good" : "bg-white/[0.04] text-fog",
                )}
              >
                {tb.status === "open" ? "open" : "free"}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-center rounded-xl bg-white p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl(tb.id, "svg")}
                alt={`QR for ${tb.label}`}
                className="h-28 w-28"
                loading="lazy"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {tb.status === "open" ? (
                <button
                  disabled={busy === tb.id}
                  onClick={() => run(() => closeTableAction(tb.id), tb.id)}
                  className="btn btn-ghost flex-1 !py-1.5 text-xs"
                >
                  Close table
                </button>
              ) : (
                <button
                  disabled={busy === tb.id}
                  onClick={() => run(() => openTableAction(tb.id), tb.id)}
                  className="btn btn-ghost flex-1 !py-1.5 text-xs"
                >
                  Open table
                </button>
              )}
              <a
                href={qrUrl(tb.id, "png", 720)}
                download={`qr-${props.slug}-${tb.label.replace(/\s+/g, "-").toLowerCase()}.png`}
                className="btn btn-good !py-1.5 text-xs"
              >
                PNG ⭳
              </a>
              <button
                className="btn btn-ghost !px-2 !py-1.5 text-xs"
                onClick={() => {
                  setEditing(tb.id);
                  setEditLabel(tb.label.replace(/^Table\s+/, ""));
                }}
              >
                Rename
              </button>
              <button
                className="btn btn-danger !px-2 !py-1.5 text-xs"
                onClick={() => {
                  if (confirm(`Delete ${tb.label}? Its QR code will stop working.`))
                    run(() => deleteTableAction(tb.id), tb.id);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {/* add new table */}
        <div className="flex flex-col justify-center rounded-2xl border border-dashed border-line p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-fog-2">Add a table</p>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder='e.g. "14" or "Garden"'
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTable()}
            />
            <button onClick={addTable} className="btn btn-gold !px-3">
              +
            </button>
          </div>
          <p className="mt-2 text-[11px] text-fog-2">
            A QR code is generated automatically for every table.
          </p>
        </div>
      </div>
    </div>
  );
}
