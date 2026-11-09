import type { Lang } from "@/components/site-chrome";

/** Shared public copy (homepage + /pilot). Greek wording should be reviewed by a native speaker. */
export const HEADLINE = {
  en: "Guests order from their seat. Your staff keep working the way they do now.",
  el: "Οι πελάτες παραγγέλνουν από τη θέση τους. Το προσωπικό σας δουλεύει όπως πάντα.",
} as const;

export const SUBLINE = {
  en: "Guests scan a QR code on the table or sunbed, choose from a menu with photos and tap Send. The order appears on a phone or tablet behind the bar.",
  el: "Οι πελάτες σκανάρουν ένα QR στο τραπέζι ή στην ξαπλώστρα, διαλέγουν από μενού με φωτογραφίες και πατούν Αποστολή. Η παραγγελία εμφανίζεται σε κινητό ή tablet πίσω από το μπαρ.",
} as const;

type Step = { n: string; title: string; body: string };

export const STEPS: Record<Lang, { heading: string; items: Step[] }> = {
  en: {
    heading: "How it works",
    items: [
      { n: "1", title: "Scan", body: "Guests scan the QR code on the table or sunbed. The menu opens in their phone's browser, in English or Greek." },
      { n: "2", title: "Choose", body: "They pick drinks and food from a menu with photos and add them to the order." },
      { n: "3", title: "Send", body: "They tap Send. The order appears on a phone or tablet behind the bar, with the table number." },
    ],
  },
  el: {
    heading: "Πώς λειτουργεί",
    items: [
      { n: "1", title: "Σκανάρουν", body: "Οι πελάτες σκανάρουν το QR στο τραπέζι ή στην ξαπλώστρα. Το μενού ανοίγει στον browser του κινητού τους, στα ελληνικά ή στα αγγλικά." },
      { n: "2", title: "Διαλέγουν", body: "Επιλέγουν ποτά και φαγητά από μενού με φωτογραφίες και τα προσθέτουν στην παραγγελία." },
      { n: "3", title: "Στέλνουν", body: "Πατούν Αποστολή. Η παραγγελία εμφανίζεται σε κινητό ή tablet πίσω από το μπαρ, με τον αριθμό τραπεζιού." },
    ],
  },
};

export const STAYS: Record<Lang, { heading: string; items: { title: string; body: string }[] }> = {
  en: {
    heading: "What stays the same for you",
    items: [
      { title: "No app for guests", body: "The menu opens straight from the QR code in the phone's browser." },
      { title: "No new hardware", body: "A phone or tablet you already own becomes the bar screen." },
      { title: "Your cash register stays as it is", body: "Receipts are still rung on your own system, as today. Ordavo does not replace it." },
      { title: "We do the setup", body: "We set up your menu and print the QR codes." },
      { title: "Changes in seconds", body: "Prices and sold-out items are updated in seconds, from your phone." },
    ],
  },
  el: {
    heading: "Τι μένει ίδιο για εσάς",
    items: [
      { title: "Καμία εφαρμογή για τους πελάτες", body: "Το μενού ανοίγει κατευθείαν από το QR, στον browser του κινητού." },
      { title: "Κανένας νέος εξοπλισμός", body: "Ένα κινητό ή tablet που ήδη έχετε γίνεται η οθόνη του μπαρ." },
      { title: "Το ταμείο σας μένει όπως είναι", body: "Οι αποδείξεις εκδίδονται στο δικό σας σύστημα, όπως σήμερα. Το Ordavo δεν το αντικαθιστά." },
      { title: "Την εγκατάσταση την κάνουμε εμείς", body: "Φτιάχνουμε το μενού σας και τυπώνουμε τα QR." },
      { title: "Αλλαγές σε δευτερόλεπτα", body: "Τιμές και εξαντλημένα προϊόντα αλλάζουν σε δευτερόλεπτα, από το κινητό σας." },
    ],
  },
};

export const MEASURE: Record<Lang, { heading: string; items: string[] }> = {
  en: {
    heading: "What we measure together",
    items: [
      "Share of orders that came through the QR code",
      "Average order value",
      "Speed in your busiest hour",
    ],
  },
  el: {
    heading: "Τι μετράμε μαζί",
    items: [
      "Ποσοστό των παραγγελιών που έγιναν μέσω QR",
      "Μέση αξία παραγγελίας",
      "Ταχύτητα την πιο γεμάτη ώρα",
    ],
  },
};

export function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8.25" opacity="0.4" />
      <path d="m6.5 10.3 2.3 2.3 4.7-4.9" />
    </svg>
  );
}

export function StaysList({ lang }: { lang: Lang }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {STAYS[lang].items.map((it) => (
        <li key={it.title} className="flex gap-3">
          <CheckIcon />
          <div>
            <p className="font-semibold text-cream">{it.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-fog">{it.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StepsGrid({ lang }: { lang: Lang }) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {STEPS[lang].items.map((s) => (
        <li key={s.n} className="card p-6">
          <span aria-hidden="true" className="serif text-5xl font-semibold leading-none text-gold/70">
            {s.n}
          </span>
          <h3 className="serif mt-3 text-2xl font-semibold text-cream">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-fog">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export const PAY: Record<Lang, { heading: string; body: string; items: string[] }> = {
  en: {
    heading: "Guests can pay from their phone",
    body: "When they are ready, guests pay for what they ordered by card or Apple Pay. The money goes straight into your own Viva Wallet account. Ordavo never touches it and never sees the card.",
    items: [
      "Each round is paid on its own. Paying does not close the table.",
      "The bar screen shows PAID next to the order, so your staff ring the receipt in their own system, as they do today.",
      "A guest who wants the receipt first simply does not pay on the phone.",
      "Connecting your Viva account takes a couple of days. We set it up with you.",
    ],
  },
  el: {
    heading: "Οι πελάτες μπορούν να πληρώνουν από το κινητό",
    body: "Όταν είναι έτοιμοι, πληρώνουν όσα παρήγγειλαν με κάρτα ή Apple Pay. Τα χρήματα πηγαίνουν κατευθείαν στον δικό σας λογαριασμό Viva Wallet. Το Ordavo δεν τα αγγίζει και δεν βλέπει την κάρτα.",
    items: [
      "Κάθε γύρος πληρώνεται ξεχωριστά. Η πληρωμή δεν κλείνει το τραπέζι.",
      "Η οθόνη του μπαρ δείχνει ΠΛΗΡΩΜΕΝΟ δίπλα στην παραγγελία, ώστε το προσωπικό να εκδώσει την απόδειξη στο δικό του σύστημα, όπως σήμερα.",
      "Όποιος θέλει πρώτα την απόδειξη, απλώς δεν πληρώνει από το κινητό.",
      "Η σύνδεση του λογαριασμού Viva διαρκεί λίγες μέρες. Την κάνουμε μαζί σας.",
    ],
  },
};

export function PaySection({ lang, widthClass }: { lang: Lang; widthClass: string }) {
  const p = PAY[lang];
  return (
    <section aria-labelledby="pay" className={`mx-auto ${widthClass} px-4 py-12 sm:px-6`}>
      <div className="grid gap-8 rounded-2xl border border-gold/30 bg-gold/[0.04] p-6 sm:p-9 md:grid-cols-2">
        <div>
          <h2 id="pay" className="serif text-3xl font-semibold text-cream sm:text-4xl">
            {p.heading}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-fog">{p.body}</p>
        </div>
        <ul className="space-y-3 text-sm leading-relaxed text-fog sm:text-base">
          {p.items.map((it) => (
            <li key={it} className="flex gap-3">
              <span aria-hidden="true" className="mt-1 text-gold">✓</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
