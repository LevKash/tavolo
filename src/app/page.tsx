import Link from "next/link";

const steps = [
  {
    n: "01",
    title: "Guests scan the table QR",
    body: "The menu opens instantly on their phone — no app, no login, no waiting for a waiter. Scanning opens the table in your POS automatically.",
  },
  {
    n: "02",
    title: "Staff confirm, the bar pours",
    body: "The first order of every new table is held for a quick staff check — prank-proof. Then every round goes straight to the bar queue.",
  },
  {
    n: "03",
    title: "You run it from one dashboard",
    body: "Live sales, menu editor, tables and print-ready QR sheets — plus staff and bar screens protected by a simple PIN.",
  },
];

const features = [
  ["🪄", "Instant guest menu", "Menu as the very first paint after the scan — bilingual EN/EL, search, category chips, allergen icons."],
  ["🛡️", "Anti-fraud confirmation", "First order of a session waits for staff confirmation before it reaches the bar. The table becomes trusted after that."],
  ["🍸", "Wheel of luck", "Guests who can't decide spin for a random available drink — a fun upsell that logs every spin."],
  ["🖨️", "QR codes built in", "SVG + PNG per table, plus a printable sheet of every table QR. Pointed straight at your venue's menu."],
  ["🔔", "Live bar & staff screens", "Order queue with start/serve states, waiter calls with sound alerts, open tables with running totals."],
  ["📊", "Owner dashboard", "Today's revenue, average ticket, top items and orders by table — polling live every 3 seconds."],
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(201,164,92,0.16),transparent)]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(201,164,92,0.08),transparent)]" />
      </div>

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="serif text-2xl font-semibold tracking-wide text-cream">
          Tavolo<span className="text-gold">.</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/login" className="btn btn-ghost">Log in</Link>
          <Link href="/signup" className="btn btn-gold">Start free</Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20 pt-16 text-center sm:pt-24">
        <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-gold-2">
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-gold" />
          Built for cocktail bars & taverns
        </p>
        <h1 className="serif animate-rise mt-6 text-balance text-5xl font-semibold leading-[1.04] text-cream sm:text-7xl" style={{ animationDelay: "60ms" }}>
          Every table
          <br />
          <span className="text-gold">orders itself.</span>
        </h1>
        <p className="animate-rise mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-fog sm:text-lg" style={{ animationDelay: "120ms" }}>
          Guests scan the QR on their table and order drinks from their phone.
          Staff confirm, the bar pours, and you watch the evening add up in
          real time — no apps, no hardware, no hassle.
        </p>
        <div className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "180ms" }}>
          <Link href="/signup" className="btn btn-gold px-6 py-3 text-sm">
            Create your venue — free
          </Link>
          <Link href="/m/ambrosia?table=12" className="btn btn-ghost px-6 py-3 text-sm">
            Try the live guest demo →
          </Link>
        </div>
        <p className="animate-rise mt-4 text-xs text-fog-2" style={{ animationDelay: "220ms" }}>
          No credit card · Set up in 2 minutes · Demo PIN for staff screens: 1234
        </p>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="glass grid gap-6 rounded-2xl p-6 sm:grid-cols-3 sm:p-8">
          {steps.map((s) => (
            <div key={s.n} className="animate-rise">
              <span className="serif text-3xl font-semibold text-gold/60">{s.n}</span>
              <h3 className="serif mt-3 text-xl font-semibold text-cream">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fog">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <h2 className="serif text-center text-3xl font-semibold text-cream sm:text-4xl">
          Everything a modern bar needs<span className="text-gold">.</span>
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([icon, title, body]) => (
            <div key={title} className="card p-6 transition-transform duration-200 hover:-translate-y-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/25 bg-gold/10 text-lg">
                {icon}
              </div>
              <h3 className="mt-4 font-bold text-cream">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fog">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="glass rounded-2xl p-8 sm:p-10">
          <h2 className="serif text-3xl font-semibold text-cream sm:text-4xl">
            Open a demo right now
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-fog">
            Everything below is live against a seeded demo venue, “ΑΜΒΡΟΣΙΑ — Cocktail Bar”.
            Sign in with <span className="text-gold-2">demo@ambrosia.gr</span> ·{" "}
            <span className="text-gold-2">demo1234</span>
          </p>
          <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
            {[
              { href: "/m/ambrosia?table=12", label: "Guest menu · Table 12", note: "What guests see on their phone" },
              { href: "/bar/ambrosia", label: "Bar screen", note: "Queue, PIN 1234" },
              { href: "/staff/ambrosia", label: "Staff screen", note: "Confirmations & calls, PIN 1234" },
              { href: "/dashboard", label: "Owner dashboard", note: "Today's numbers & controls" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group rounded-xl border border-line bg-white/[0.02] p-4 transition-colors hover:border-gold/45 hover:bg-gold/5"
              >
                <span className="font-bold text-gold-2 group-hover:text-gold-3">{l.label} →</span>
                <span className="mt-0.5 block text-xs text-fog">{l.note}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-line px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-fog-2 sm:flex-row">
          <span className="serif text-lg text-fog">Tavolo<span className="text-gold">.</span></span>
          <span>White-label QR table ordering · PostgreSQL · Next.js</span>
          <span>© {new Date().getFullYear()} Tavolo</span>
        </div>
      </footer>
    </main>
  );
}
