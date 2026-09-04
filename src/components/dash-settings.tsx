"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateVenueAction } from "@/lib/actions";
import type { VenuePublic } from "@/lib/types";

export interface SettingsData extends VenuePublic {
  barPin: string;
  plan: string;
}

export default function DashSettings(props: { venue: SettingsData }) {
  const v = props.venue;
  const router = useRouter();
  const [form, setForm] = useState({
    name: v.name,
    tagline: v.tagline,
    description: v.description,
    currency: v.currency,
    accent_color: v.accentColor,
    address: v.address,
    phone: v.phone,
    hours: v.hours,
    instagram: v.instagram,
    wifi_name: v.wifiName,
    wifi_password: v.wifiPassword,
    bar_pin: v.barPin,
    is_published: v.published,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await updateVenueAction(form);
    setBusy(false);
    if (res?.error) {
      setMsg({ ok: false, text: res.error });
    } else {
      setMsg({ ok: true, text: "Saved ✓" });
      router.refresh();
    }
    window.setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="serif text-3xl font-semibold text-cream">Settings</h1>
          <p className="mt-1 text-sm text-fog">Venue profile, PIN & publishing.</p>
        </div>
        <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-bold uppercase text-gold-2">
          {v.plan} plan
        </span>
      </div>

      {msg && (
        <p
          className={
            msg.ok
              ? "rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm text-good"
              : "rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          }
        >
          {msg.text}
        </p>
      )}

      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-fog">Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue name">
            <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <input className="input" value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            className="input min-h-20 resize-none"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency">
            <select className="input" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
              {["EUR", "USD", "GBP", "CHF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Accent colour">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => set({ accent_color: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent"
              />
              <input
                className="input"
                value={form.accent_color}
                onChange={(e) =>
                  set({
                    accent_color: /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) ? e.target.value : form.accent_color,
                  })
                }
              />
            </div>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address">
            <input className="input" value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Opening hours">
            <input className="input" value={form.hours} onChange={(e) => set({ hours: e.target.value })} />
          </Field>
          <Field label="Instagram">
            <input className="input" value={form.instagram} onChange={(e) => set({ instagram: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-fog">WiFi & access</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WiFi name (shown on guest menu)">
            <input className="input" value={form.wifi_name} onChange={(e) => set({ wifi_name: e.target.value })} />
          </Field>
          <Field label="WiFi password">
            <input className="input" value={form.wifi_password} onChange={(e) => set({ wifi_password: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bar / staff PIN" hint="4–6 digits, unlocks bar & staff screens">
            <input
              className="input tracking-[0.4em]"
              inputMode="numeric"
              value={form.bar_pin}
              maxLength={6}
              onChange={(e) => set({ bar_pin: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-cream">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => set({ is_published: e.target.checked })}
                className="h-4 w-4 accent-[#c9a45c]"
              />
              Menu published (guests can order)
            </label>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-xs text-fog-2">
          Guest menu: <span className="text-gold-2">/m/{v.slug}</span> · Bar:{" "}
          <span className="text-gold-2">/bar/{v.slug}</span> · Staff:{" "}
          <span className="text-gold-2">/staff/{v.slug}</span>
        </p>
        <button onClick={save} disabled={busy} className="btn btn-gold px-8">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {props.label}
        {props.hint && <span className="ml-1 normal-case tracking-normal text-fog-2">· {props.hint}</span>}
      </label>
      {props.children}
    </div>
  );
}
