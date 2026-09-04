"use client";

import { useState } from "react";
import { adminLoginAction } from "@/lib/actions";

/** Credentials form for the platform-admin entrance. */
export default function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await adminLoginAction({ email, password });
    if (res?.error) setError(res.error);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error && (
        <p
          role="alert"
          className="animate-pop rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div>
        <label className="label" htmlFor="admin-email">Admin email</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <button type="submit" disabled={busy} className="btn btn-gold w-full py-3">
        {busy ? "Signing in…" : "Sign in to admin panel"}
      </button>
    </form>
  );
}
