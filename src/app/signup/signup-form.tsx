"use client";

import { useState } from "react";
import { signupAction } from "@/lib/actions";
import { slugify } from "@/lib/util";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [venueName, setVenueName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function venueNameChanged(v: string) {
    setVenueName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await signupAction({ name, email, password, venueName, slug });
    if (res?.error) {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error && (
        <p className="animate-pop rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" className="input" required value={name}
            onChange={(e) => setName(e.target.value)} placeholder="Maria" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@bar.com" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" className="input" required minLength={6}
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters" />
      </div>
      <div className="hairline !border-line pt-3" />
      <div>
        <label className="label" htmlFor="venueName">Venue name</label>
        <input id="venueName" className="input" required value={venueName}
          onChange={(e) => venueNameChanged(e.target.value)}
          placeholder="e.g. Aurora Cocktail Bar" />
      </div>
      <div>
        <label className="label" htmlFor="slug">Menu URL</label>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-3 focus-within:border-gold/60">
          <span className="text-sm text-fog-2">tavolo.app/m/</span>
          <input
            id="slug"
            className="w-full bg-transparent py-2.5 text-sm text-cream outline-none"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="aurora-bar"
          />
        </div>
      </div>
      <button type="submit" disabled={busy} className="btn btn-gold w-full py-3">
        {busy ? "Creating your venue…" : "Create venue & dashboard"}
      </button>
      <p className="text-center text-[11px] text-fog-2">
        Your guest menu will be live immediately at your new URL. Tables 1–8 and
        “Bar” are created for you — edit them anytime.
      </p>
    </form>
  );
}
