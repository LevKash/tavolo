"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitPilotRequest, type PilotState } from "@/lib/pilot-request";
import { CONTACT_EMAIL, focusRing, langHref, type Lang } from "@/components/site-chrome";

const t = {
  en: {
    title: "Request a free pilot",
    intro: "Tell us about your venue. We will get back to you personally.",
    name: "Your name",
    venue: "Venue name",
    town: "Town / area",
    contact: "Phone or email",
    message: "Message (optional)",
    send: "Send request",
    sending: "Sending…",
    okTitle: "Thank you, we received your request.",
    okBody: "We will contact you soon.",
    invalid: "Please check the highlighted fields.",
    rate: "Too many requests from this connection. Please try again later or write to us at",
    error: "We could not send your request just now. Please write to us at",
    privacy: "How we handle your details: see our",
    privacyLink: "privacy policy",
  },
  el: {
    title: "Ζητήστε δωρεάν πιλοτικό",
    intro: "Πείτε μας για το μαγαζί σας. Θα σας απαντήσουμε προσωπικά.",
    name: "Το όνομά σας",
    venue: "Όνομα καταστήματος",
    town: "Πόλη / περιοχή",
    contact: "Τηλέφωνο ή email",
    message: "Μήνυμα (προαιρετικά)",
    send: "Αποστολή αιτήματος",
    sending: "Αποστολή…",
    okTitle: "Ευχαριστούμε, λάβαμε το αίτημά σας.",
    okBody: "Θα επικοινωνήσουμε σύντομα μαζί σας.",
    invalid: "Ελέγξτε τα επισημασμένα πεδία.",
    rate: "Πολλά αιτήματα από αυτή τη σύνδεση. Δοκιμάστε ξανά αργότερα ή γράψτε μας στο",
    error: "Δεν μπορέσαμε να στείλουμε το αίτημά σας αυτή τη στιγμή. Γράψτε μας στο",
    privacy: "Πώς χειριζόμαστε τα στοιχεία σας: δείτε την",
    privacyLink: "πολιτική απορρήτου",
  },
} as const;

const initial: PilotState = { status: "idle" };

export function SitePilotForm({ lang }: { lang: Lang }) {
  const [state, action, pending] = useActionState(submitPilotRequest, initial);
  const c = t[lang];

  if (state.status === "ok") {
    return (
      <div role="status" className="card border-gold/30 p-6 sm:p-8">
        <p className="serif text-2xl font-semibold text-cream">{c.okTitle}</p>
        <p className="mt-2 text-fog">{c.okBody}</p>
      </div>
    );
  }

  const bad = (f: string) => state.status === "invalid" && state.fields?.includes(f);
  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`pr-${id}`} className="label">
        {label}
      </label>
      <input
        id={`pr-${id}`}
        name={id}
        defaultValue={state.values?.[id] ?? ""}
        className="input"
        disabled={pending}
        aria-invalid={bad(id) ? true : undefined}
        style={bad(id) ? { borderColor: "var(--color-danger)" } : undefined}
        {...props}
      />
    </div>
  );

  return (
    <form action={action} className="card relative p-6 sm:p-8">
      <h2 className="serif text-3xl font-semibold text-cream">{c.title}</h2>
      <p className="mt-1 text-sm text-fog">{c.intro}</p>
      <input type="hidden" name="lang" value={lang} />
      {/* honeypot: hidden from people and assistive tech */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="pr-website">Website</label>
        <input id="pr-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {field("name", c.name, { required: true, minLength: 2, maxLength: 80, autoComplete: "name" })}
        {field("venue", c.venue, { required: true, minLength: 2, maxLength: 120, autoComplete: "organization" })}
        {field("town", c.town, { required: true, minLength: 2, maxLength: 80, autoComplete: "address-level2" })}
        {field("contact", c.contact, { required: true, maxLength: 120, autoComplete: "email" })}
      </div>
      <div className="mt-4">
        <label htmlFor="pr-message" className="label">
          {c.message}
        </label>
        <textarea id="pr-message" name="message" rows={4} defaultValue={state.values?.message ?? ""} maxLength={1000} className="input" disabled={pending} />
      </div>

      <div aria-live="polite">
        {state.status === "invalid" && <p className="mt-4 text-sm text-danger">{c.invalid}</p>}
        {(state.status === "error" || state.status === "rate") && (
          <p className="mt-4 text-sm text-danger">
            {state.status === "rate" ? c.rate : c.error}{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        )}
      </div>

      <button type="submit" disabled={pending} className={`btn btn-gold mt-6 !px-6 !py-3 !text-sm ${focusRing}`}>
        {pending ? c.sending : c.send}
      </button>
      <p className="mt-4 text-xs text-fog">
        {c.privacy}{" "}
        <Link href={langHref("/privacy", lang)} className={`rounded underline hover:text-gold-2 ${focusRing}`}>
          {c.privacyLink}
        </Link>
        .
      </p>
    </form>
  );
}
