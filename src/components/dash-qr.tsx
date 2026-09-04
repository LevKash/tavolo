"use client";

import type { TableInfo } from "@/lib/types";

export default function DashQr(props: {
  slug: string;
  venueName: string;
  tables: TableInfo[];
}) {
  const { slug, venueName, tables } = props;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const qr = (tableId: string | null, fmt: string, size = 380) =>
    `/api/qr?slug=${encodeURIComponent(slug)}${tableId ? `&table=${tableId}` : ""}&format=${fmt}&size=${size}`;

  const target = (tableId: string | null) =>
    `${origin}/m/${slug}${tableId ? `?table=${tableId}` : ""}`;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between print-hide">
        <div>
          <h1 className="serif text-3xl font-semibold text-cream">QR codes</h1>
          <p className="mt-1 text-sm text-fog">
            {venueName} · every code opens the guest menu instantly.
          </p>
        </div>
        <button onClick={() => window.print()} className="btn btn-gold">
          🖨️ Print all table QRs
        </button>
      </div>

      <section className="card p-6 print-hide">
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-2xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr(null, "svg", 240)} alt="Venue QR" className="h-40 w-40" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="serif text-xl font-semibold text-cream">Venue QR</h2>
            <p className="mt-1 text-sm text-fog">
              Put this at the entrance or on the bar. It opens the menu for
              browsing (ordering needs a table QR).
            </p>
            <p className="mt-2 break-all rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-xs text-fog-2">
              {target(null)}
            </p>
            <div className="mt-3 flex gap-2">
              <a href={qr(null, "png", 720)} download={`qr-${slug}-venue.png`} className="btn btn-good !py-1.5 text-xs">
                Download PNG
              </a>
              <a href={qr(null, "svg")} download={`qr-${slug}-venue.svg`} className="btn btn-ghost !py-1.5 text-xs">
                Download SVG
              </a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="serif mb-4 text-2xl font-semibold text-cream print-hide">
          Table codes · {tables.length}
        </h2>
        <div className="print-area grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((t) => (
            <div key={t.id} className="card flex flex-col items-center p-4 text-center">
              <p className="serif text-lg font-semibold text-cream">{t.label}</p>
              <div className="my-3 w-full rounded-xl bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr(t.id, "svg")}
                  alt={`QR for ${t.label}`}
                  className="mx-auto h-28 w-28 sm:h-32 sm:w-32"
                  loading="lazy"
                />
              </div>
              <p className="mb-3 break-all text-[10px] leading-tight text-fog-2">{target(t.id)}</p>
              <a
                href={qr(t.id, "png", 640)}
                download={`qr-${slug}-${t.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`}
                className="btn btn-ghost !py-1.5 text-xs print-hide"
              >
                ⭳ PNG
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
