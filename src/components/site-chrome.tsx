import Link from "next/link";
import type { ReactNode } from "react";

export type Lang = "en" | "el";

export const CONTACT_EMAIL = "contact@levkashkin.eu";
export const SITE_HOST = "ordavo.vercel.app";

/** Read ?lang= (string | string[] | undefined). Anything but "el" is English. */
export function resolveLang(v: string | string[] | undefined): Lang {
  const x = Array.isArray(v) ? v[0] : v;
  return x === "el" ? "el" : "en";
}

/** Internal link that keeps the chosen language. */
export function langHref(path: string, lang: Lang): string {
  return lang === "el" ? `${path}?lang=el` : path;
}

/** Metadata helper: canonical + hreflang alternates for a public page. */
export function pageAlternates(path: string, lang: Lang) {
  return {
    canonical: langHref(path, lang),
    languages: { en: path, el: `${path}?lang=el` },
  };
}

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const t = {
  en: {
    skip: "Skip to content",
    request: "Request a pilot",
    login: "Log in",
    langLabel: "Language",
    privacy: "Privacy",
    terms: "Terms",
    rights: "Ordavo",
    tagline: "QR ordering for bars, beach bars and tavernas.",
    contact: "Contact",
    ownerLogin: "Venue owner log in",
  },
  el: {
    skip: "Μετάβαση στο περιεχόμενο",
    request: "Ζητήστε πιλοτικό",
    login: "Σύνδεση",
    langLabel: "Γλώσσα",
    privacy: "Απόρρητο",
    terms: "Όροι χρήσης",
    rights: "Ordavo",
    tagline: "Παραγγελίες με QR για μπαρ, μπιτς μπαρ και ταβέρνες.",
    contact: "Επικοινωνία",
    ownerLogin: "Σύνδεση για καταστήματα",
  },
} as const;

export function Logo({ lang }: { lang: Lang }) {
  return (
    <Link
      href={langHref("/", lang)}
      aria-label="Ordavo"
      className={`serif rounded text-2xl font-semibold tracking-wide text-cream ${focusRing}`}
    >
      Ordavo<span className="text-gold">.</span>
    </Link>
  );
}

export function LangSwitch({ lang, path }: { lang: Lang; path: string }) {
  const item = (code: Lang, label: string) => {
    const active = lang === code;
    return (
      <Link
        href={`${path}?lang=${code}`}
        hrefLang={code}
        lang={code}
        aria-current={active ? "true" : undefined}
        scroll={false}
        className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${focusRing} ${
          active ? "bg-gold text-[#17130a]" : "text-fog hover:text-gold-2"
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav
      aria-label={t[lang].langLabel}
      className="flex items-center gap-0.5 rounded-full border border-line bg-white/[0.03] p-0.5"
    >
      {item("en", "EN")}
      {item("el", "EL")}
    </nav>
  );
}

export function SiteHeader({ lang, path }: { lang: Lang; path: string }) {
  return (
    <>
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-[#17130a] ${focusRing}`}
      >
        {t[lang].skip}
      </a>
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-5 sm:px-6">
        <Logo lang={lang} />
        <div className="flex items-center gap-2 sm:gap-3">
          <LangSwitch lang={lang} path={path} />
          <Link
            href="/login"
            className={`hidden rounded px-1 text-xs font-semibold text-fog hover:text-gold-2 sm:inline ${focusRing}`}
          >
            {t[lang].login}
          </Link>
          <Link
            href={langHref("/pilot", lang)}
            className={`btn btn-gold !px-3 !py-2 !text-xs sm:!px-4 sm:!text-sm ${focusRing}`}
          >
            {t[lang].request}
          </Link>
        </div>
      </header>
    </>
  );
}

export function SiteFooter({ lang }: { lang: Lang }) {
  const year = new Date().getFullYear();
  const link = `rounded text-fog hover:text-gold-2 ${focusRing}`;
  return (
    <footer className="relative z-10 border-t border-gold/15">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="serif text-2xl font-semibold text-cream">
            Ordavo<span className="text-gold">.</span>
          </p>
          <p className="mt-1 text-sm text-fog">{t[lang].tagline}</p>
          <p className="mt-4 text-sm text-fog">
            <a href={`mailto:${CONTACT_EMAIL}`} className={`font-semibold text-gold-2 hover:underline ${focusRing} rounded`}>
              {CONTACT_EMAIL}
            </a>
            <span aria-hidden="true"> · </span>
            <a href={`https://${SITE_HOST}`} className={link}>
              {SITE_HOST}
            </a>
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link href={langHref("/privacy", lang)} className={link}>
            {t[lang].privacy}
          </Link>
          <Link href={langHref("/terms", lang)} className={link}>
            {t[lang].terms}
          </Link>
          <Link href="/login" className={`${link} text-xs`}>
            {t[lang].ownerLogin}
          </Link>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 text-xs text-fog sm:px-6">
        © {year} {t[lang].rights}
      </div>
    </footer>
  );
}

/** Soft gold glows behind the page. */
export function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(201,164,92,0.15),transparent)]" />
      <div className="absolute bottom-0 right-0 h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(201,164,92,0.07),transparent)]" />
    </div>
  );
}

export function PageShell({
  lang,
  path,
  children,
}: {
  lang: Lang;
  path: string;
  children: ReactNode;
}) {
  return (
    <div lang={lang} className="relative min-h-screen overflow-hidden">
      <Ambient />
      <SiteHeader lang={lang} path={path} />
      <main id="main" className="relative z-10">
        {children}
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
