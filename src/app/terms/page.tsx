// DRAFT: these terms are a working draft and need review by a lawyer before they are relied on. Greek text needs native review too.
import type { Metadata } from "next";
import { pageAlternates, resolveLang, type Lang } from "@/components/site-chrome";
import { LegalPage, type LegalSection } from "@/components/site-legal";

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

const titles = { en: "Terms of use", el: "Όροι χρήσης" } as const;
const descriptions = {
  en: "Simple terms for the Ordavo free pilot and for using the service.",
  el: "Απλοί όροι για το δωρεάν πιλοτικό του Ordavo και για τη χρήση της υπηρεσίας.",
} as const;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = resolveLang((await searchParams).lang);
  return {
    title: titles[lang],
    description: descriptions[lang],
    alternates: pageAlternates("/terms", lang),
    openGraph: { title: titles[lang], description: descriptions[lang] },
  };
}

const EMAIL = "contact@levkashkin.eu";

const content: Record<Lang, { intro: string; sections: LegalSection[] }> = {
  en: {
    intro:
      "These terms apply to venues that use Ordavo, including during the free pilot. We kept them short and simple.",
    sections: [
      {
        h: "What Ordavo is",
        p: [
          "Ordavo is a tool that lets guests send an order from a menu by scanning a QR code, and shows that order to the venue's staff on a phone or tablet.",
        ],
      },
      {
        h: "The pilot",
        ul: [
          "The pilot lasts 3 weeks and is free.",
          "The service is provided as is. We work to keep it running well, but we do not promise that it will always be available or free of errors.",
          "Either side can stop the pilot at any time, without giving a reason.",
          "The price after the pilot, if any, is agreed with you before the pilot starts. Nothing is charged unless you agree to it.",
        ],
      },
      {
        h: "Payments and fiscal obligations",
        p: [
          "Ordavo does not process payments and does not issue receipts or other fiscal documents. The venue charges its guests in its own way, as it does today.",
          "The venue is responsible for its own sales records, receipts and taxes.",
        ],
      },
      {
        h: "Menu content",
        p: [
          "The venue is responsible for the content of its menu, including prices, descriptions, photos and allergen information, and for keeping it correct and up to date. Ordavo shows what the venue enters.",
        ],
      },
      {
        h: "Using the service",
        p: [
          "Please use Ordavo only for its intended purpose and do not try to disturb or misuse it. Venue owners keep their login details private. Guests should only order what they intend to order.",
        ],
      },
      {
        h: "Liability",
        p: [
          "To the extent the law allows, Ordavo is not liable for losses caused by interruptions, errors or missed orders during the pilot. The venue should always have a way to take orders by hand.",
        ],
      },
      {
        h: "Your data",
        p: ["How we handle personal data is explained in our privacy policy."],
      },
      {
        h: "Changes and contact",
        p: [
          "We may update these terms and will change the date at the top of the page. Governing law is the law of Greece.",
          `Questions? Write to ${EMAIL}.`,
        ],
      },
    ],
  },
  el: {
    intro:
      "Οι όροι αυτοί ισχύουν για τα καταστήματα που χρησιμοποιούν το Ordavo, και κατά τη διάρκεια του δωρεάν πιλοτικού. Τους κρατήσαμε σύντομους και απλούς.",
    sections: [
      {
        h: "Τι είναι το Ordavo",
        p: [
          "Το Ordavo είναι ένα εργαλείο που επιτρέπει στους πελάτες να στέλνουν παραγγελία από ένα μενού σκανάροντας ένα QR, και δείχνει την παραγγελία στο προσωπικό του καταστήματος σε κινητό ή tablet.",
        ],
      },
      {
        h: "Το πιλοτικό",
        ul: [
          "Το πιλοτικό διαρκεί 3 εβδομάδες και είναι δωρεάν.",
          "Η υπηρεσία παρέχεται «ως έχει». Προσπαθούμε να λειτουργεί καλά, αλλά δεν υποσχόμαστε ότι θα είναι πάντα διαθέσιμη ή χωρίς σφάλματα.",
          "Οποιοδήποτε από τα δύο μέρη μπορεί να σταματήσει το πιλοτικό οποιαδήποτε στιγμή, χωρίς να δώσει εξήγηση.",
          "Η τιμή μετά το πιλοτικό, αν υπάρχει, συμφωνείται μαζί σας πριν ξεκινήσει το πιλοτικό. Δεν χρεώνεται τίποτα χωρίς τη συμφωνία σας.",
        ],
      },
      {
        h: "Πληρωμές και φορολογικές υποχρεώσεις",
        p: [
          "Το Ordavo δεν επεξεργάζεται πληρωμές και δεν εκδίδει αποδείξεις ή άλλα φορολογικά παραστατικά. Το κατάστημα χρεώνει τους πελάτες του με τον δικό του τρόπο, όπως σήμερα.",
          "Το κατάστημα είναι υπεύθυνο για τα δικά του αρχεία πωλήσεων, τις αποδείξεις και τους φόρους του.",
        ],
      },
      {
        h: "Περιεχόμενο μενού",
        p: [
          "Το κατάστημα είναι υπεύθυνο για το περιεχόμενο του μενού του, συμπεριλαμβανομένων των τιμών, των περιγραφών, των φωτογραφιών και των πληροφοριών για αλλεργιογόνα, και για να παραμένουν σωστά και ενημερωμένα. Το Ordavo εμφανίζει ό,τι καταχωρίζει το κατάστημα.",
        ],
      },
      {
        h: "Χρήση της υπηρεσίας",
        p: [
          "Παρακαλούμε χρησιμοποιείτε το Ordavo μόνο για τον σκοπό του και μην επιχειρείτε να το διαταράξετε ή να το καταχραστείτε. Οι ιδιοκτήτες καταστημάτων κρατούν τα στοιχεία σύνδεσής τους ιδιωτικά. Οι πελάτες πρέπει να παραγγέλνουν μόνο ό,τι πραγματικά θέλουν.",
        ],
      },
      {
        h: "Ευθύνη",
        p: [
          "Στο μέτρο που επιτρέπει ο νόμος, το Ordavo δεν ευθύνεται για ζημίες από διακοπές, σφάλματα ή χαμένες παραγγελίες κατά το πιλοτικό. Το κατάστημα πρέπει πάντα να έχει τρόπο να παίρνει παραγγελίες και χειροκίνητα.",
        ],
      },
      {
        h: "Τα δεδομένα σας",
        p: ["Πώς χειριζόμαστε τα προσωπικά δεδομένα εξηγείται στην πολιτική απορρήτου μας."],
      },
      {
        h: "Αλλαγές και επικοινωνία",
        p: [
          "Μπορεί να ενημερώσουμε τους όρους και θα αλλάξουμε την ημερομηνία στην κορυφή της σελίδας. Εφαρμοστέο δίκαιο είναι το ελληνικό.",
          `Ερωτήσεις; Γράψτε στο ${EMAIL}.`,
        ],
      },
    ],
  },
};

export default async function TermsPage({ searchParams }: Props) {
  const lang = resolveLang((await searchParams).lang);
  return (
    <LegalPage lang={lang} path="/terms" title={titles[lang]} intro={content[lang].intro} sections={content[lang].sections} />
  );
}
