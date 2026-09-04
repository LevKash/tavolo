"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminDeleteAccountAction,
  demoteAdminAction,
  promoteAdminAction,
} from "@/lib/actions";

/** Email input → grants is_admin to an existing account. */
export function PromoteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    if (!window.confirm(`Make ${target} a platform admin?\n\nThey will see every venue and this panel.`)) {
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await promoteAdminAction(target);
    setBusy(false);
    if (res?.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: `${target} is now an admin ✓` });
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@example.gr"
          className="input !py-1.5 w-72 text-sm"
          autoComplete="off"
          required
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="btn btn-gold !px-4 !py-1.5 text-xs font-bold"
        >
          {busy ? "…" : "Promote to admin"}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-good" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

/** Revoke is_admin. Disabled for yourself and for the last remaining admin. */
export function DemoteButton({
  userId,
  email,
  disabled,
}: {
  userId: string;
  email: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function demote() {
    if (!window.confirm(`Remove admin rights from ${email}?\n\nThey keep their account and venue.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await demoteAdminAction(userId);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        onClick={demote}
        disabled={disabled || busy}
        title={disabled ? "You can't demote yourself or the last admin" : undefined}
        className="btn btn-ghost !px-3 !py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/10"
      >
        {busy ? "…" : "Demote"}
      </button>
      {error && <p className="mt-1 text-[10px] text-danger">{error}</p>}
    </div>
  );
}

/**
 * Permanently delete an account that owns no venues (an orphan), freeing its
 * email for a fresh signup. Disabled for yourself, the last admin, and any
 * account that still owns venues.
 */
export function DeleteAccountButton({
  userId,
  email,
  disabled,
  disabledTitle,
}: {
  userId: string;
  email: string;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    if (
      !window.confirm(
        `Permanently delete the account ${email}?\n\nThis frees the email for a new signup. The account owns no venues, so no venue data is touched. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await adminDeleteAccountAction(userId);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        onClick={del}
        disabled={disabled || busy}
        title={disabled ? disabledTitle : undefined}
        className="btn btn-ghost !px-3 !py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "…" : "Delete"}
      </button>
      {error && <p className="mt-1 text-[10px] text-danger">{error}</p>}
    </div>
  );
}
