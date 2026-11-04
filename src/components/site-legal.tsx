import { PageShell, type Lang } from "@/components/site-chrome";

export type LegalSection = { h: string; p?: string[]; ul?: string[] };

const t = {
  en: { updated: "Last updated" },
  el: { updated: "Τελευταία ενημέρωση" },
} as const;

export const LEGAL_UPDATED: Record<Lang, string> = {
  en: "5 November 2026",
  el: "5 Νοεμβρίου 2026",
};

export function LegalPage({
  lang,
  path,
  title,
  intro,
  sections,
}: {
  lang: Lang;
  path: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <PageShell lang={lang} path={path}>
      <article className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-12">
        <h1 className="serif text-balance text-4xl font-semibold leading-tight text-cream sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm font-semibold text-gold-2">
          {t[lang].updated}: <time dateTime="2026-11-05">{LEGAL_UPDATED[lang]}</time>
        </p>
        <p className="mt-6 leading-relaxed text-fog">{intro}</p>
        {sections.map((s) => (
          <section key={s.h} className="mt-9">
            <h2 className="serif text-2xl font-semibold text-cream sm:text-3xl">{s.h}</h2>
            {s.p?.map((x) => (
              <p key={x} className="mt-3 leading-relaxed text-fog">
                {x}
              </p>
            ))}
            {s.ul && (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-fog marker:text-gold">
                {s.ul.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </PageShell>
  );
}
