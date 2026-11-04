// NOTE: public marketing copy (EN/EL). Greek wording is a draft and should be read by a native speaker.
import type { Metadata } from "next";
import Link from "next/link";
import {
  PageShell,
  focusRing,
  langHref,
  pageAlternates,
  resolveLang,
  type Lang,
} from "@/components/site-chrome";
import {
  HEADLINE,
  MEASURE,
  STAYS,
  STEPS,
  SUBLINE,
  CheckIcon,
  StaysList,
  StepsGrid,
} from "@/components/site-copy";
import { SiteReel } from "@/components/site-reel";

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

const meta = {
  en: {
    title: "Ordavo — QR ordering for bars and beach bars",
    description:
      "Guests scan a QR code on the table or sunbed, choose from a menu with photos and tap Send. The order appears on a phone or tablet behind the bar. Free 3-week pilot.",
  },
  el: {
    title: "Ordavo — Παραγγελίες με QR για μπαρ και μπιτς μπαρ",
    description:
      "Οι πελάτες σκανάρουν ένα QR στο τραπέζι ή στην ξαπλώστρα, διαλέγουν από μενού με φωτογραφίες και πατούν Αποστολή. Η παραγγελία εμφανίζεται σε κινητό ή tablet πίσω από το μπαρ. Δωρεάν πιλοτικό 3 εβδομάδων.",
  },
} as const;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = resolveLang((await searchParams).lang);
  return {
    title: { absolute: meta[lang].title },
    description: meta[lang].description,
    alternates: pageAlternates("/", lang),
    openGraph: { title: meta[lang].title, description: meta[lang].description, locale: lang === "el" ? "el_GR" : "en_US" },
  };
}

const t = {
  en: {
    ctaPilot: "Request a free pilot",
    ctaDemo: "Try the guest menu",
    reelLabel: "Short film showing how a guest orders by scanning a QR code on the table",
    reelHint: "Tap the video for sound and controls",
    builtFor: "Built for",
    venues: ["Beach bars", "Cocktail bars", "Tavernas", "Cafés"],
    pilotKicker: "The pilot",
    pilotTitle: "Try it for 3 weeks. Free.",
    pilotBody:
      "We set up your menu and QR codes. You use Ordavo in real service for three weeks. Then we sit down and look at the numbers together, and you decide whether to continue.",
    pilotMeasureTitle: "We look at",
    pilotDecide: "You decide at the end. No obligation.",
    faqTitle: "Questions",
    faq: [
      ["Does it replace my cash register?", "No. Your cash register stays exactly as it is."],
      ["Do guests need an app?", "No. They scan the QR code and the menu opens in their phone's browser."],
      ["Which languages?", "English and Greek."],
      ["Who takes payment?", "You, the way you do today."],
      ["What does it cost after the pilot?", "We agree the price with you before the pilot starts."],
    ],
    finalTitle: "Want to see it in your venue?",
    finalBody: "Tell us where you are. We will get back to you personally.",
  },
  el: {
    ctaPilot: "Ζητήστε δωρεάν πιλοτικό",
    ctaDemo: "Δοκιμάστε το μενού των πελατών",
    reelLabel: "Σύντομο βίντεο που δείχνει πώς ένας πελάτης παραγγέλνει σκανάροντας ένα QR στο τραπέζι",
    reelHint: "Πατήστε το βίντεο για ήχο και χειριστήρια",
    builtFor: "Για",
    venues: ["Μπιτς μπαρ", "Κοκτέιλ μπαρ", "Ταβέρνες", "Καφέ"],
    pilotKicker: "Το πιλοτικό",
    pilotTitle: "Δοκιμάστε το για 3 εβδομάδες. Δωρεάν.",
    pilotBody:
      "Φτιάχνουμε το μενού και τα QR σας. Χρησιμοποιείτε το Ordavo σε κανονικό σέρβις για τρεις εβδομάδες. Μετά κάθουμε μαζί, βλέπουμε τα νούμερα και αποφασίζετε εσείς αν θα συνεχίσετε.",
    pilotMeasureTitle: "Κοιτάμε",
    pilotDecide: "Αποφασίζετε εσείς στο τέλος. Χωρίς υποχρέωση.",
    faqTitle: "Ερωτήσεις",
    faq: [
      ["Αντικαθιστά το ταμείο μου;", "Όχι. Το ταμείο σας μένει ακριβώς όπως είναι."],
      ["Χρειάζονται οι πελάτες εφαρμογή;", "Όχι. Σκανάρουν το QR και το μενού ανοίγει στον browser του κινητού τους."],
      ["Σε ποιες γλώσσες;", "Αγγλικά και ελληνικά."],
      ["Ποιος εισπράττει την πληρωμή;", "Εσείς, όπως σήμερα."],
      ["Πόσο κοστίζει μετά το πιλοτικό;", "Συμφωνούμε την τιμή μαζί σας πριν ξεκινήσει το πιλοτικό."],
    ],
    finalTitle: "Θέλετε να το δείτε στο μαγαζί σας;",
    finalBody: "Πείτε μας πού βρίσκεστε. Θα σας απαντήσουμε προσωπικά.",
  },
} as const;

export default async function LandingPage({ searchParams }: Props) {
  const lang: Lang = resolveLang((await searchParams).lang);
  const c = t[lang];

  return (
    <PageShell lang={lang} path="/">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 sm:pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:pb-24">
        <div className="motion-safe:animate-rise">
          <h1 className="serif text-balance text-4xl font-semibold leading-[1.08] text-cream sm:text-6xl">
            {HEADLINE[lang]}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-fog sm:text-lg">{SUBLINE[lang]}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={langHref("/pilot", lang)} className={`btn btn-gold !px-6 !py-3 !text-sm ${focusRing}`}>
              {c.ctaPilot}
            </Link>
            <Link href="/m/ambrosia?table=12" className={`btn btn-ghost !px-6 !py-3 !text-sm ${focusRing}`}>
              {c.ctaDemo}
            </Link>
          </div>
        </div>
        <div className="motion-safe:animate-rise" style={{ animationDelay: "120ms" }}>
          <SiteReel label={c.reelLabel} hint={c.reelHint} />
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="how" className="serif text-3xl font-semibold text-cream sm:text-4xl">
          {STEPS[lang].heading}
        </h2>
        <div className="mt-6">
          <StepsGrid lang={lang} />
        </div>
      </section>

      {/* What stays the same */}
      <section aria-labelledby="stays" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="glass rounded-2xl p-6 sm:p-9">
          <h2 id="stays" className="serif text-3xl font-semibold text-cream sm:text-4xl">
            {STAYS[lang].heading}
          </h2>
          <div className="mt-6">
            <StaysList lang={lang} />
          </div>
        </div>
      </section>

      {/* Built for */}
      <section aria-labelledby="built" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h2 id="built" className="text-xs font-bold uppercase tracking-[0.18em] text-fog">
          {c.builtFor}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {c.venues.map((v) => (
            <li key={v} className="rounded-full border border-line bg-white/[0.02] px-4 py-2 text-sm font-semibold text-cream">
              {v}
            </li>
          ))}
        </ul>
      </section>

      {/* Pilot offer */}
      <section aria-labelledby="pilot" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="card relative overflow-hidden border-gold/30 p-6 shadow-glow sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{c.pilotKicker}</p>
          <h2 id="pilot" className="serif mt-2 text-balance text-3xl font-semibold text-cream sm:text-5xl">
            {c.pilotTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-fog">{c.pilotBody}</p>
          <p className="mt-6 text-sm font-semibold text-cream">{c.pilotMeasureTitle}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {MEASURE[lang].items.map((m) => (
              <li key={m} className="flex gap-2 text-sm leading-snug text-fog">
                <CheckIcon />
                <span>{m}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm font-semibold text-gold-2">{c.pilotDecide}</p>
          <div className="mt-6">
            <Link href={langHref("/pilot", lang)} className={`btn btn-gold !px-6 !py-3 !text-sm ${focusRing}`}>
              {c.ctaPilot}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h2 id="faq" className="serif text-3xl font-semibold text-cream sm:text-4xl">
          {c.faqTitle}
        </h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white/[0.02]">
          {c.faq.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary
                className={`flex cursor-pointer list-none items-center justify-between gap-4 rounded font-semibold text-cream [&::-webkit-details-marker]:hidden ${focusRing}`}
              >
                <span>{q}</span>
                <span aria-hidden="true" className="text-xl leading-none text-gold transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-fog">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section aria-labelledby="final" className="mx-auto max-w-3xl px-4 pb-20 pt-8 text-center sm:px-6">
        <h2 id="final" className="serif text-balance text-3xl font-semibold text-cream sm:text-4xl">
          {c.finalTitle}
        </h2>
        <p className="mt-3 text-fog">{c.finalBody}</p>
        <div className="mt-6">
          <Link href={langHref("/pilot", lang)} className={`btn btn-gold !px-6 !py-3 !text-sm ${focusRing}`}>
            {c.ctaPilot}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
