// NOTE: public marketing copy (EN/EL). Greek wording is a draft and should be read by a native speaker.
import type { Metadata } from "next";
import { PageShell, pageAlternates, resolveLang, type Lang } from "@/components/site-chrome";
import {
  HEADLINE,
  MEASURE,
  PaySection,
  STAYS,
  STEPS,
  SUBLINE,
  CheckIcon,
  StaysList,
  StepsGrid,
} from "@/components/site-copy";
import { SitePilotForm } from "@/components/site-pilot-form";

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

const meta = {
  en: {
    title: "Free 3-week pilot",
    description:
      "Try QR ordering in your bar, beach bar or taverna for 3 weeks, free. We set up the menu and QR codes, you decide at the end.",
  },
  el: {
    title: "Δωρεάν πιλοτικό 3 εβδομάδων",
    description:
      "Δοκιμάστε παραγγελίες με QR στο μπαρ, στο μπιτς μπαρ ή στην ταβέρνα σας για 3 εβδομάδες, δωρεάν. Φτιάχνουμε εμείς το μενού και τα QR, αποφασίζετε εσείς στο τέλος.",
  },
} as const;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = resolveLang((await searchParams).lang);
  return {
    title: meta[lang].title,
    description: meta[lang].description,
    alternates: pageAlternates("/pilot", lang),
    openGraph: { title: meta[lang].title, description: meta[lang].description, locale: lang === "el" ? "el_GR" : "en_US" },
  };
}

const t = {
  en: {
    kicker: "Free pilot for venue owners",
    termsTitle: "How the pilot works",
    terms: [
      "3 weeks, free.",
      "We set up your menu and the QR stickers.",
      "You put the QR codes on the tables and open the bar screen at the start of service. Briefing your staff takes about 10 minutes.",
      "Charging stays as it is today.",
      "We agree on day 1 to meet on day 21 and decide together.",
      "The price after the pilot is agreed before the pilot starts.",
    ],
    measureNote: "At the meeting on day 21 you see the numbers, and you decide whether to continue.",
  },
  el: {
    kicker: "Δωρεάν πιλοτικό για καταστήματα",
    termsTitle: "Πώς λειτουργεί το πιλοτικό",
    terms: [
      "3 εβδομάδες, δωρεάν.",
      "Φτιάχνουμε το μενού σας και τα αυτοκόλλητα QR.",
      "Εσείς τοποθετείτε τα QR στα τραπέζια και ανοίγετε την οθόνη του μπαρ στην αρχή του σέρβις. Η ενημέρωση του προσωπικού διαρκεί περίπου 10 λεπτά.",
      "Η χρέωση μένει όπως σήμερα.",
      "Συμφωνούμε από την 1η μέρα να συναντηθούμε την 21η μέρα και να αποφασίσουμε μαζί.",
      "Η τιμή μετά το πιλοτικό συμφωνείται πριν ξεκινήσει το πιλοτικό.",
    ],
    measureNote: "Στη συνάντηση της 21ης μέρας βλέπετε τα νούμερα και αποφασίζετε αν θα συνεχίσετε.",
  },
} as const;

export default async function PilotPage({ searchParams }: Props) {
  const lang: Lang = resolveLang((await searchParams).lang);
  const c = t[lang];

  return (
    <PageShell lang={lang} path="/pilot">
      <section className="mx-auto max-w-4xl px-4 pb-10 pt-6 sm:px-6 sm:pt-12">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{c.kicker}</p>
        <h1 className="serif mt-3 text-balance text-4xl font-semibold leading-[1.08] text-cream sm:text-6xl">
          {HEADLINE[lang]}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-fog sm:text-lg">{SUBLINE[lang]}</p>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h2 id="how" className="serif text-3xl font-semibold text-cream">
          {STEPS[lang].heading}
        </h2>
        <div className="mt-6">
          <StepsGrid lang={lang} />
        </div>
      </section>

      <PaySection lang={lang} widthClass="max-w-5xl" />

      <section aria-labelledby="stays" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="glass rounded-2xl p-6 sm:p-9">
          <h2 id="stays" className="serif text-3xl font-semibold text-cream">
            {STAYS[lang].heading}
          </h2>
          <div className="mt-6">
            <StaysList lang={lang} />
          </div>
        </div>
      </section>

      <section aria-labelledby="terms" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card border-gold/30 p-6 sm:p-8">
            <h2 id="terms" className="serif text-3xl font-semibold text-cream">
              {c.termsTitle}
            </h2>
            <ul className="mt-5 space-y-3">
              {c.terms.map((x) => (
                <li key={x} className="flex gap-3 text-sm leading-relaxed text-fog">
                  <CheckIcon />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6 sm:p-8">
            <h2 className="serif text-3xl font-semibold text-cream">{MEASURE[lang].heading}</h2>
            <ul className="mt-5 space-y-3">
              {MEASURE[lang].items.map((x) => (
                <li key={x} className="flex gap-3 text-sm leading-relaxed text-fog">
                  <CheckIcon />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm font-semibold text-gold-2">{c.measureNote}</p>
          </div>
        </div>
      </section>

      <section id="request" className="mx-auto max-w-3xl scroll-mt-6 px-4 pb-20 pt-10 sm:px-6">
        <SitePilotForm lang={lang} />
      </section>
    </PageShell>
  );
}
