"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateVenueAction } from "@/lib/actions";

export interface AdminVenueFields {
  id: string;
  name: string;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  hours: string;
  instagram: string;
  logo_url: string;
  accent_color: string;
  currency: string;
  plan: string;
  is_published: boolean;
}

/** Platform-admin editor for a venue's base profile fields. */
export default function VenueEditor(props: {
  venue: AdminVenueFields;
  plans: readonly string[];
}) {
  const v = props.venue;
  const router = useRouter();
  const [form, setForm] = useState({
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
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await adminUpdateVenueAction(v.id, form);
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
    <div className="mt-6 space-y-4">
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

      <section className="card space-y-4 p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          Profile
        </h2>
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

      <section className="card space-y-4 p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          Branding
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logo URL" hint="https://…">
            <input className="input" value={form.logo_url} onChange={(e) => set({ logo_url: e.target.value })} />
          </Field>
          <Field label="Accent colour">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(form.accent_color) ? form.accent_color : "#c9a45c"}
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
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          Plan & publishing
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Currency">
            <select className="input" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
              {["EUR", "USD", "GBP", "CHF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Plan">
            <select className="input" value={form.plan} onChange={(e) => set({ plan: e.target.value })}>
              {props.plans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-cream">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => set({ is_published: e.target.checked })}
                className="h-4 w-4 accent-[#c9a45c]"
              />
              Menu published
            </label>
          </div>
        </div>
        <p className="text-[10px] text-fog-2">
          Bar PIN, WiFi and the URL slug stay under the owner&apos;s control in their
          own Settings — admins edit only the base profile here.
        </p>
      </section>

      <div className="flex justify-end">
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
