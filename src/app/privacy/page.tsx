// DRAFT: this privacy policy is a working draft and needs review by a lawyer before it is relied on. Greek text needs native review too.
import type { Metadata } from "next";
import { pageAlternates, resolveLang, type Lang } from "@/components/site-chrome";
import { LegalPage, type LegalSection } from "@/components/site-legal";

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

const titles = { en: "Privacy policy", el: "Πολιτική απορρήτου" } as const;
const descriptions = {
  en: "What data Ordavo collects, why, who processes it and what rights you have.",
  el: "Ποια δεδομένα συλλέγει το Ordavo, γιατί, ποιοι τα επεξεργάζονται και ποια δικαιώματα έχετε.",
} as const;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = resolveLang((await searchParams).lang);
  return {
    title: titles[lang],
    description: descriptions[lang],
    alternates: pageAlternates("/privacy", lang),
    openGraph: { title: titles[lang], description: descriptions[lang] },
  };
}

const EMAIL = "contact@levkashkin.eu";

const content: Record<Lang, { intro: string; sections: LegalSection[] }> = {
  en: {
    intro:
      "Ordavo lets guests order from a menu by scanning a QR code, and shows the order to the venue's staff. This page explains in simple words what data we handle and why.",
    sections: [
      {
        h: "Who is responsible",
        p: [
          `Ordavo is the controller of the data described here. You can reach us at ${EMAIL}.`,
          "For the orders and menus of a venue, the venue decides what it sells and to whom. Ordavo provides the tool.",
        ],
      },
      {
        h: "What we collect from guests",
        ul: [
          "A random guest identifier, different for each venue, stored in your browser. It is not your name and it does not identify you personally.",
          "The orders you place: items, quantities, notes you type, the table or sunbed number and the time.",
          "How often menu items are viewed (counts).",
        ],
        p: ["In this version we do not ask guests for a name, an email address or any payment details."],
      },
      {
        h: "What we collect from venue owners",
        ul: [
          "Your name and email address.",
          "Your venue data: venue name, menu, prices, tables and settings.",
          "Your password, stored only in hashed form. We cannot read it.",
        ],
      },
      {
        h: "Pilot requests",
        p: [
          "If you send us a pilot request, we receive the name, venue name, town or area, phone or email and the message you type. We use it only to get back to you. The request reaches us through a private Telegram message.",
        ],
      },
      {
        h: "Why we use the data and on what legal basis",
        ul: [
          "To run the ordering service and show orders to the venue's staff: performance of a contract with the venue, and our legitimate interest in providing a working service.",
          "To show venues simple numbers about their own orders and menu: contract and legitimate interest.",
          "To keep the service secure and prevent misuse: legitimate interest.",
          "To answer your pilot request: steps taken at your request before a contract.",
        ],
      },
      {
        h: "How long we keep it",
        p: [
          "Orders are kept for as long as the venue's account is active, unless the venue asks us to delete them earlier. Account data is kept while the account exists. Pilot requests are kept as long as needed to deal with your request. You can ask us to delete your data at any time.",
        ],
      },
      {
        h: "Who processes data for us",
        ul: [
          "Vercel: hosting of the website and application.",
          "Neon: database hosting.",
          "Telegram: notifications to us about new requests.",
        ],
        p: [
          "These providers process data on our behalf. Some of them may process data outside the European Economic Area, under standard contractual clauses or similar safeguards. We do not sell your data and we do not use it for advertising.",
        ],
      },
      {
        h: "Cookies",
        p: [
          "We use only one strictly necessary session cookie, and only for venue owners who log in. It keeps you logged in. We do not use tracking, analytics or advertising cookies. The guest identifier mentioned above is stored in your browser so that your orders at a venue stay together.",
        ],
      },
      {
        h: "Your rights",
        p: [
          "Under the GDPR you can ask us for access to your data, correction, deletion, restriction of processing, a copy of the data you gave us, and you can object to processing based on legitimate interest.",
          `To use these rights, write to ${EMAIL}. We will answer within one month.`,
          "You also have the right to complain to the Hellenic Data Protection Authority (dpa.gr).",
        ],
      },
      {
        h: "Changes",
        p: ["If we change this policy we will update the date at the top of the page."],
      },
    ],
  },
  el: {
    intro:
      "Το Ordavo επιτρέπει στους πελάτες να παραγγέλνουν από ένα μενού σκανάροντας ένα QR και δείχνει την παραγγελία στο προσωπικό του καταστήματος. Εδώ εξηγούμε με απλά λόγια ποια δεδομένα χειριζόμαστε και γιατί.",
    sections: [
      {
        h: "Ποιος είναι υπεύθυνος",
        p: [
          `Το Ordavo είναι ο υπεύθυνος επεξεργασίας των δεδομένων που περιγράφονται εδώ. Μπορείτε να μας γράψετε στο ${EMAIL}.`,
          "Για τις παραγγελίες και το μενού ενός καταστήματος, το ίδιο το κατάστημα αποφασίζει τι πουλά και σε ποιον. Το Ordavo παρέχει το εργαλείο.",
        ],
      },
      {
        h: "Τι συλλέγουμε από τους πελάτες",
        ul: [
          "Έναν τυχαίο αναγνωριστικό κωδικό πελάτη, διαφορετικό για κάθε κατάστημα, που αποθηκεύεται στον browser σας. Δεν είναι το όνομά σας και δεν σας ταυτοποιεί προσωπικά.",
          "Τις παραγγελίες που κάνετε: προϊόντα, ποσότητες, σημειώσεις που γράφετε, τον αριθμό τραπεζιού ή ξαπλώστρας και την ώρα.",
          "Πόσες φορές προβλήθηκαν τα προϊόντα του μενού (μετρητές).",
        ],
        p: ["Σε αυτή την έκδοση δεν ζητάμε από τους πελάτες όνομα, email ή στοιχεία πληρωμής."],
      },
      {
        h: "Τι συλλέγουμε από τους ιδιοκτήτες καταστημάτων",
        ul: [
          "Το όνομα και το email σας.",
          "Τα στοιχεία του καταστήματός σας: όνομα, μενού, τιμές, τραπέζια και ρυθμίσεις.",
          "Τον κωδικό πρόσβασής σας, που αποθηκεύεται μόνο σε κρυπτογραφημένη (hash) μορφή. Δεν μπορούμε να τον διαβάσουμε.",
        ],
      },
      {
        h: "Αιτήματα για πιλοτικό",
        p: [
          "Όταν μας στέλνετε αίτημα για πιλοτικό, λαμβάνουμε το όνομά σας, το όνομα του καταστήματος, την πόλη ή περιοχή, το τηλέφωνο ή το email και το μήνυμα που γράφετε. Τα χρησιμοποιούμε μόνο για να σας απαντήσουμε. Το αίτημα φτάνει σε εμάς με ιδιωτικό μήνυμα στο Telegram.",
        ],
      },
      {
        h: "Γιατί χρησιμοποιούμε τα δεδομένα και με ποια νομική βάση",
        ul: [
          "Για να λειτουργεί η υπηρεσία παραγγελιών και να εμφανίζονται οι παραγγελίες στο προσωπικό του καταστήματος: εκτέλεση σύμβασης με το κατάστημα και έννομο συμφέρον μας να παρέχουμε μια υπηρεσία που λειτουργεί.",
          "Για να δείχνουμε στα καταστήματα απλά στοιχεία για τις δικές τους παραγγελίες και το μενού τους: σύμβαση και έννομο συμφέρον.",
          "Για την ασφάλεια της υπηρεσίας και την αποτροπή κατάχρησης: έννομο συμφέρον.",
          "Για να απαντήσουμε στο αίτημά σας για πιλοτικό: ενέργειες κατόπιν αιτήματός σας πριν από τη σύναψη σύμβασης.",
        ],
      },
      {
        h: "Πόσο διατηρούμε τα δεδομένα",
        p: [
          "Οι παραγγελίες διατηρούνται όσο ο λογαριασμός του καταστήματος είναι ενεργός, εκτός αν το κατάστημα ζητήσει νωρίτερα τη διαγραφή τους. Τα στοιχεία λογαριασμού διατηρούνται όσο υπάρχει ο λογαριασμός. Τα αιτήματα πιλοτικού διατηρούνται όσο χρειάζεται για να τα διεκπεραιώσουμε. Μπορείτε να ζητήσετε τη διαγραφή των δεδομένων σας οποιαδήποτε στιγμή.",
        ],
      },
      {
        h: "Ποιοι επεξεργάζονται δεδομένα για εμάς",
        ul: [
          "Vercel: φιλοξενία του ιστότοπου και της εφαρμογής.",
          "Neon: φιλοξενία της βάσης δεδομένων.",
          "Telegram: ειδοποιήσεις προς εμάς για νέα αιτήματα.",
        ],
        p: [
          "Οι πάροχοι αυτοί επεξεργάζονται δεδομένα για λογαριασμό μας. Κάποιοι μπορεί να επεξεργάζονται δεδομένα εκτός Ευρωπαϊκού Οικονομικού Χώρου, με τυπικές συμβατικές ρήτρες ή αντίστοιχες εγγυήσεις. Δεν πουλάμε τα δεδομένα σας και δεν τα χρησιμοποιούμε για διαφήμιση.",
        ],
      },
      {
        h: "Cookies",
        p: [
          "Χρησιμοποιούμε μόνο ένα απολύτως απαραίτητο cookie συνεδρίας, και μόνο για τους ιδιοκτήτες καταστημάτων που συνδέονται. Σας κρατά συνδεδεμένους. Δεν χρησιμοποιούμε cookies παρακολούθησης, στατιστικών ή διαφήμισης. Ο αναγνωριστικός κωδικός πελάτη που αναφέρεται παραπάνω αποθηκεύεται στον browser σας ώστε οι παραγγελίες σας σε ένα κατάστημα να μένουν μαζί.",
        ],
      },
      {
        h: "Τα δικαιώματά σας",
        p: [
          "Σύμφωνα με τον GDPR μπορείτε να ζητήσετε πρόσβαση στα δεδομένα σας, διόρθωση, διαγραφή, περιορισμό της επεξεργασίας, αντίγραφο των δεδομένων που μας δώσατε, και μπορείτε να αντιταχθείτε στην επεξεργασία που βασίζεται σε έννομο συμφέρον.",
          `Για να ασκήσετε τα δικαιώματά σας, γράψτε στο ${EMAIL}. Θα απαντήσουμε εντός ενός μηνός.`,
          "Έχετε επίσης το δικαίωμα να υποβάλετε καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (dpa.gr).",
        ],
      },
      {
        h: "Αλλαγές",
        p: ["Αν αλλάξουμε αυτή την πολιτική, θα ενημερώσουμε την ημερομηνία στην κορυφή της σελίδας."],
      },
    ],
  },
};

export default async function PrivacyPage({ searchParams }: Props) {
  const lang = resolveLang((await searchParams).lang);
  return (
    <LegalPage lang={lang} path="/privacy" title={titles[lang]} intro={content[lang].intro} sections={content[lang].sections} />
  );
}
