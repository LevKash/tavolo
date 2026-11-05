"use client";

import { useState, useTransition } from "react";
import { saveVivaSettingsAction, testVivaConnectionAction } from "@/lib/actions";

export interface VivaSettingsData {
  env: "demo" | "live";
  clientId: string;
  merchantId: string;
  sourceCode: string;
  hasSecret: boolean;
  hasApiKey: boolean;
  enabled: boolean;
  webhookUrl: string;
  successUrl: string;
  failureUrl: string;
}

const label = "block text-[11px] uppercase tracking-[0.16em] text-fog-2 mb-1.5";
const field =
  "w-full rounded-lg border border-line bg-white/[0.02] px-3 py-2.5 text-sm text-cream placeholder:text-fog-2/60 focus:border-gold/60 focus:outline-none";

export default function DashVivaSettings({ initial }: { initial: VivaSettingsData }) {
  const [clientId, setClientId] = useState(initial.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [merchantId, setMerchantId] = useState(initial.merchantId);
  const [sourceCode, setSourceCode] = useState(initial.sourceCode);
  const [env, setEnv] = useState<"demo" | "live">(initial.env);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [hasSecret, setHasSecret] = useState(initial.hasSecret);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(initial.hasApiKey);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  function save() {
    startSave(async () => {
      const res = await saveVivaSettingsAction({
        clientId,
        clientSecret,
        apiKey,
        merchantId,
        sourceCode,
        env,
        enabled,
      });
      if (res.error) setMsg({ ok: false, text: res.error });
      else {
        setHasSecret(hasSecret || Boolean(clientSecret));
        setHasApiKey(hasApiKey || Boolean(apiKey));
        setApiKey("");
        setClientSecret("");
        setMsg({ ok: true, text: res.notice ?? "Saved." });
      }
    });
  }

  function test() {
    startTest(async () => {
      const res = await testVivaConnectionAction();
      setMsg(
        res.error
          ? { ok: false, text: res.error }
          : { ok: true, text: res.notice ?? "Connected." },
      );
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-xl border border-line bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-cream">Pay at the table</p>
            <p className="mt-1 text-xs leading-relaxed text-fog">
              Guests see a “Pay” button once they have an open bill. Turning this off hides
              the button — tables are then closed at the till as before.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              enabled ? "bg-gold" : "bg-white/15"
            }`}
            aria-pressed={enabled}
            aria-label="Toggle pay at the table"
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-ink transition-all ${
                enabled ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white/[0.02] p-5">
        <p className="text-sm font-semibold text-cream">Viva Wallet credentials</p>
        <p className="mt-1 text-xs leading-relaxed text-fog">
          From your Viva account: <span className="text-cream">Settings → API access</span>.
          Create an application, then copy the Client ID / Client Secret. The Source Code is
          the 4-digit payment source linked to your sales channel.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <span className={label}>Environment</span>
            <div className="flex gap-2">
              {(["demo", "live"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnv(e)}
                  className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                    env === e
                      ? "border-gold/60 bg-gold/15 text-gold-2"
                      : "border-line text-fog hover:text-cream"
                  }`}
                >
                  {e === "demo" ? "Demo (test)" : "Live (real money)"}
                </button>
              ))}
            </div>
            {env === "live" && (
              <p className="mt-2 text-[11px] text-gold-2">
                Live mode moves real money. Test in Demo first.
              </p>
            )}
          </div>

          <div>
            <label className={label} htmlFor="viva-client-id">
              Client ID
            </label>
            <input
              id="viva-client-id"
              className={field}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. ambrosia-3f9c1a..."
              autoComplete="off"
            />
          </div>

          <div>
            <label className={label} htmlFor="viva-client-secret">
              Client Secret
            </label>
            <input
              id="viva-client-secret"
              className={field}
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={hasSecret ? "•••••••• saved — leave blank to keep" : "Paste the secret"}
              autoComplete="new-password"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="viva-merchant-id">
                Merchant ID
              </label>
              <input
                id="viva-merchant-id"
                className={field}
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder="e.g. 8f2b..."
                autoComplete="off"
              />
            </div>
            <div>
              <label className={label} htmlFor="viva-source-code">
                Source Code
              </label>
              <input
                id="viva-source-code"
                className={field}
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 digits"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="viva-api-key">
              API Key
            </label>
            <input
              id="viva-api-key"
              className={field}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasApiKey ? "•••••••• saved — leave blank to keep" : "Paste the API key"}
              autoComplete="new-password"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-fog-2">
              Required for card payments. It lets Viva verify the webhook URL below and lets
              Ordavo double-check payments that were not confirmed. Found in Viva under Settings → API Access.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-ink/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-fog-2">Webhook URL</p>
            <p className="mt-1 break-all font-mono text-xs text-cream">{initial.webhookUrl}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-fog">
              Add this in Viva under Settings → API Access → Webhooks, event “Transaction Payment
              Created”. Paid orders then show a PAID badge on the bar screen so staff can ring the
              receipt. Paying does not close the table.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-ink/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-fog-2">
              Return URLs (payment source)
            </p>
            <p className="mt-1 break-all font-mono text-xs text-cream">Success: {initial.successUrl}</p>
            <p className="mt-1 break-all font-mono text-xs text-cream">Failure: {initial.failureUrl}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-fog">
              Set these in your Viva payment source (Sales → Online Payments → Websites/Apps) so
              guests come back to Ordavo after paying.
            </p>
          </div>
        </div>

        {msg && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.ok
                ? "border border-good/40 bg-good/10 text-good"
                : "border border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            {msg.text}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn btn-gold px-5 py-2.5 text-xs uppercase tracking-[0.14em] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="btn px-5 py-2.5 text-xs uppercase tracking-[0.14em] disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
      </div>
    </div>
  );
}
