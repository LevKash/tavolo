import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  menuItems,
  menuViews,
  orders,
  orderLines,
  tableSessions,
  tables,
  users,
  venues,
  wheelSpins,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";

type NewItem = {
  name: string;
  nameAlt: string;
  description: string;
  descriptionAlt: string;
  price: number;
  tags?: string[];
  allergens?: string[];
};

type NewCategory = { name: string; nameAlt: string; description: string; descriptionAlt: string; items: NewItem[] };

const CATEGORIES: NewCategory[] = [
  {
    name: "Signature",
    nameAlt: "Υπογραφή",
    description: "House creations you will only find here",
    descriptionAlt: "Δικές μας δημιουργίες που θα βρεις μόνο εδώ",
    items: [
      {
        name: "Ambrosia Sour",
        nameAlt: "Ambrosia Sour",
        description: "Our signature — barrel-aged whiskey, honey, lemon, a whisper of saffron & egg-white silk.",
        descriptionAlt: "Το σήμα κατατεθέν μας — παλαιωμένο ουίσκι, μέλι, λεμόνι και μια πινελιά σαφράν με μετάξι από ασπράδι αυγού.",
        price: 9.5,
        tags: ["TOP"],
        allergens: ["egg"],
      },
      {
        name: "Nectar Negroni",
        nameAlt: "Nectar Negroni",
        description: "Gin, sweet vermouth & bitter orange, kissed with thyme honey.",
        descriptionAlt: "Τζιν, γλυκό βερμούτ και πικρό πορτοκάλι με άγγιγμα θυμαρίσιου μελιού.",
        price: 10,
        tags: ["NEW"],
        allergens: [],
      },
      {
        name: "Golden Daiquiri",
        nameAlt: "Golden Daiquiri",
        description: "Aged rum, fresh lime & demerara, finished with gold leaf shimmer.",
        descriptionAlt: "Παλαιωμένο ρούμι, φρέσκο λάιμ και δημοκρατική ζάχαρη με λάμψη από φύλλο χρυσού.",
        price: 8.5,
        tags: [],
        allergens: [],
      },
      {
        name: "Olympic Fizz",
        nameAlt: "Olympic Fizz",
        description: "Botanical gin, citrus trio & lavender soda — light, golden, celebratory.",
        descriptionAlt: "Φυτικό τζιν, τριάδα εσπεριδοειδών και λεμονάδα λεβάντας — ελαφρύ και γιορταστικό.",
        price: 8,
        tags: [],
        allergens: [],
      },
    ],
  },
  {
    name: "Classics",
    nameAlt: "Κλασικά",
    description: "Timeless recipes, made properly",
    descriptionAlt: "Διαχρονικές συνταγές, όπως πρέπει",
    items: [
      {
        name: "Old Fashioned",
        nameAlt: "Old Fashioned",
        description: "Bourbon, sugar, angostura bitters & a twist of orange.",
        descriptionAlt: "Μπόρμπον, ζάχαρη, bitters angostura και φλούδα πορτοκαλιού.",
        price: 8,
        tags: [],
        allergens: [],
      },
      {
        name: "Espresso Martini",
        nameAlt: "Espresso Martini",
        description: "Vodka, coffee liqueur & a double shot of our house espresso.",
        descriptionAlt: "Βότκα, λικέρ καφέ και διπλός εσπρέσο του σπιτιού.",
        price: 8.5,
        tags: ["TOP"],
        allergens: [],
      },
      {
        name: "Aperol Spritz",
        nameAlt: "Aperol Spritz",
        description: "Aperol, prosecco, soda & orange — the golden hour in a glass.",
        descriptionAlt: "Aperol, προζέκο, σόδα και πορτοκάλι — η χρυσή ώρα μέσα σε ένα ποτήρι.",
        price: 7,
        tags: [],
        allergens: [],
      },
      {
        name: "Negroni",
        nameAlt: "Negroni",
        description: "Gin, Campari, sweet vermouth — equal parts, stirred over ice.",
        descriptionAlt: "Τζιν, Campari και γλυκό βερμούτ — ίσα μέρη, αναδευμένο με πάγο.",
        price: 8,
        tags: [],
        allergens: [],
      },
    ],
  },
  {
    name: "Zero",
    nameAlt: "Zero Proof",
    description: "Serious cocktails, zero alcohol",
    descriptionAlt: "Σοβαρά κοκτέιλ, μηδέν αλκοόλ",
    items: [
      {
        name: "Virgin Spritz",
        nameAlt: "Virgin Spritz",
        description: "Blood orange, rosemary soda & tonic — bright and bitter-sweet.",
        descriptionAlt: "Πορτοκάλι βαλένθια, σόδα δεντρολίβανου και τόνικ — φωτεινό και γλυκόπικρο.",
        price: 5.5,
        tags: [],
        allergens: [],
      },
      {
        name: "Divine Mocktail",
        nameAlt: "Divine Mocktail",
        description: "Passion fruit, vanilla & sparkling pear — nectar of the gods, minus the proof.",
        descriptionAlt: "Φρούτο του πάθους, βανίλια και αφρώδες αχλάδι — νέκταρ θεών, χωρίς αλκοόλ.",
        price: 5,
        tags: [],
        allergens: [],
      },
      {
        name: "Rose Pepper G&T",
        nameAlt: "Rose Pepper G&T",
        description: "Aromatic rose syrup, pink peppercorn tonic & cucumber.",
        descriptionAlt: "Αρωματικό σιρόπι τριαντάφυλλου, τόνικ ροζ πιπεριού και αγγούρι.",
        price: 6,
        tags: ["NEW"],
        allergens: [],
      },
    ],
  },
  {
    name: "Wine & Beer",
    nameAlt: "Κρασί & Μπύρα",
    description: "Local grapes & craft pours",
    descriptionAlt: "Ντόπια σταφύλια και craft επιλογές",
    items: [
      {
        name: "Xinomavro Naoussa",
        nameAlt: "Ξινόμαυρο Νάουσα",
        description: "Boutari — a structured red from northern Greece, notes of tomato leaf & spice.",
        descriptionAlt: "Μπουτάρη — δομημένο κόκκινο από τη Βόρεια Ελλάδα με νότες τομάτας και μπαχαρικών.",
        price: 5.5,
        tags: [],
        allergens: ["sulphites"],
      },
      {
        name: "Assyrtiko Santorini",
        nameAlt: "Ασύρτικο Σαντορίνης",
        description: "Santorini's volcanic white — crisp citrus and a salty mineral finish.",
        descriptionAlt: "Το ηφαιστειογενές λευκό της Σαντορίνης — τραγανό εσπεριδοειδές με αλμυρή μεταλλική επίγευση.",
        price: 5.5,
        tags: [],
        allergens: ["sulphites"],
      },
      {
        name: "Ladadika Craft",
        nameAlt: "Ladadika Craft",
        description: "Local craft lager, brewed in Ladadika, Thessaloniki.",
        descriptionAlt: "Ντόπια craft lager, ζυθοποιημένη στα Λαδάδικα της Θεσσαλονίκης.",
        price: 4.5,
        tags: [],
        allergens: ["gluten"],
      },
    ],
  },
  {
    name: "Mezze",
    nameAlt: "Μεζέδες",
    description: "Bites to share with your drinks",
    descriptionAlt: "Μεζεδάκια για να συνοδέψεις τα ποτά σου",
    items: [
      {
        name: "Truffle Fries",
        nameAlt: "Τρούφα Πατάτες",
        description: "Crispy fries, truffle oil, parmesan & chives.",
        descriptionAlt: "Τραγανές πατάτες με λάδι τρούφας, παρμεζάνα και σχοινόπρασο.",
        price: 6.5,
        tags: ["TOP"],
        allergens: ["dairy", "gluten"],
      },
      {
        name: "Meze Platter",
        nameAlt: "Πιάτο Μεζέδων",
        description: "Chef's selection of dips, cured meats, cheeses & warm pita.",
        descriptionAlt: "Επιλογή του σεφ: ντιπς, αλλαντικά, τυριά και ζεστή πίτα.",
        price: 12,
        tags: [],
        allergens: ["dairy", "gluten", "nuts"],
      },
      {
        name: "Pastitsio Croquettes",
        nameAlt: "Κροκέτες Παστίτσιο",
        description: "Golden croquettes of béchamel pastitsio with tomato fondue.",
        descriptionAlt: "Χρυσές κροκέτες από παστίτσιο με μπεσαμέλ και σάλτσα ντομάτας.",
        price: 7,
        tags: [],
        allergens: ["dairy", "gluten", "egg"],
      },
      {
        name: "Olives & Rusks",
        nameAlt: "Ελιές & Παξιμάδια",
        description: "Barrel olives, barley rusks, oregano & olive oil.",
        descriptionAlt: "Βαρελίσιες ελιές, κριθαρένια παξιμάδια, ρίγανη και ελαιόλαδο.",
        price: 4,
        tags: [],
        allergens: ["gluten"],
      },
    ],
  },
];

let seeding: Promise<void> | null = null;

/**
 * Idempotent first-request seed. Safe to call from any route/page —
 * it resolves instantly once the demo venue exists.
 */
export function ensureSeeded(): Promise<void> {
  if (!seeding) {
    seeding = doSeed().finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

async function doSeed(): Promise<void> {
  const existing = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.slug, "ambrosia"))
    .limit(1);
  if (existing.length > 0) return;

  try {
    const owner = await db
      .insert(users)
      .values({
        email: "demo@ambrosia.gr",
        name: "Demo Owner",
        password_hash: await hashPassword("demo1234"),
        is_admin: true, // demo account doubles as the operator's admin login
      })
      .returning();

    const venue = await db
      .insert(venues)
      .values({
        owner_id: owner[0].id,
        slug: "ambrosia",
        name: "ΑΜΒΡΟΣΙΑ — Cocktail Bar",
        tagline: "Signature cocktails & mezze · Thessaloniki",
        description:
          "ΑΜΒΡΟΣΙΑ is a hidden cocktail bar in the heart of Thessaloniki — old-world glamour, house signatures and small plates, served until late.",
        currency: "EUR",
        accent_color: "#c9a45c",
        address: "Valaoritou 12, Thessaloniki 546 24",
        phone: "+30 2310 240 240",
        hours: "Tue–Sun · 18:00 – 02:30",
        instagram: "@ambrosia.cocktailbar",
        wifi_name: "AMBROSIA-GUEST",
        wifi_password: "nectar2024",
        bar_pin: "1234",
        plan: "pro",
        is_published: true,
      })
      .returning();
    const venueId = venue[0].id;

    const tableRows = await db
      .insert(tables)
      .values(
        Array.from({ length: 12 }, (_, i) => ({
          venue_id: venueId,
          label: String(i + 1),
          sort_order: i + 1,
        })).concat([{ venue_id: venueId, label: "Bar", sort_order: 13 }]),
      )
      .returning();
    const tableByLabel = new Map(tableRows.map((t) => [t.label, t]));

    const catRows = await db
      .insert(categories)
      .values(
        CATEGORIES.map((c, i) => ({
          venue_id: venueId,
          name: c.name,
          name_alt: c.nameAlt,
          description: c.description,
          description_alt: c.descriptionAlt,
          sort_order: i,
          is_visible: true,
        })),
      )
      .returning();

    const itemByName = new Map<string, { id: string; price: number }>();
    for (let ci = 0; ci < CATEGORIES.length; ci++) {
      const cat = catRows[ci];
      const catSeed = CATEGORIES[ci];
      for (let ii = 0; ii < catSeed.items.length; ii++) {
        const it = catSeed.items[ii];
        const row = await db
          .insert(menuItems)
          .values({
            venue_id: venueId,
            category_id: cat.id,
            name: it.name,
            name_alt: it.nameAlt,
            description: it.description,
            description_alt: it.descriptionAlt,
            price: it.price,
            tags: it.tags ?? [],
            allergens: it.allergens ?? [],
            is_available: true,
            sort_order: ii,
          })
          .returning();
        itemByName.set(it.name, { id: row[0].id, price: it.price });
      }
    }

    const now = Date.now();
    const min = (m: number) => new Date(now - m * 60_000);

    // ---- Live state -------------------------------------------------
    // Table 3: opened 6 min ago; first order waiting for confirmation.
    const t3 = tableByLabel.get("3")!;
    const s3 = (
      await db
        .insert(tableSessions)
        .values({ venue_id: venueId, table_id: t3.id, opened_at: min(6) })
        .returning()
    )[0];
    const aperol = itemByName.get("Aperol Spritz")!;
    const o3 = (
      await db
        .insert(orders)
        .values({
          venue_id: venueId,
          table_id: t3.id,
          session_id: s3.id,
          status: "pending_confirm",
          source: "menu",
          total: 14,
          created_at: min(2),
        })
        .returning()
    )[0];
    await db.insert(orderLines).values([
      { order_id: o3.id, menu_item_id: aperol.id, name_snapshot: "Aperol Spritz", price_snapshot: 7, qty: 2 },
    ]);

    // Table 12: open 95 min; a making order + an earlier served order.
    const t12 = tableByLabel.get("12")!;
    const s12 = (
      await db
        .insert(tableSessions)
        .values({ venue_id: venueId, table_id: t12.id, opened_at: min(95) })
        .returning()
    )[0];
    const sour = itemByName.get("Ambrosia Sour")!;
    const fries = itemByName.get("Truffle Fries")!;
    const making = (
      await db
        .insert(orders)
        .values({
          venue_id: venueId,
          table_id: t12.id,
          session_id: s12.id,
          status: "making",
          source: "menu",
          note: "Extra truffle on the fries please",
          total: 25.5,
          created_at: min(8),
        })
        .returning()
    )[0];
    await db.insert(orderLines).values([
      { order_id: making.id, menu_item_id: sour.id, name_snapshot: "Ambrosia Sour", price_snapshot: 9.5, qty: 2 },
      { order_id: making.id, menu_item_id: fries.id, name_snapshot: "Truffle Fries", price_snapshot: 6.5, qty: 1 },
    ]);
    const espresso = itemByName.get("Espresso Martini")!;
    const served = (
      await db
        .insert(orders)
        .values({
          venue_id: venueId,
          table_id: t12.id,
          session_id: s12.id,
          status: "served",
          source: "menu",
          total: 17,
          created_at: min(70),
        })
        .returning()
    )[0];
    await db.insert(orderLines).values([
      { order_id: served.id, menu_item_id: espresso.id, name_snapshot: "Espresso Martini", price_snapshot: 8.5, qty: 2 },
    ]);
    await db
      .update(tableSessions)
      .set({ total: 42.5 })
      .where(eq(tableSessions.id, s12.id));

    // Table 7: open, just scanned, no orders yet.
    const t7 = tableByLabel.get("7")!;
    await db
      .insert(tableSessions)
      .values({ venue_id: venueId, table_id: t7.id, opened_at: min(24) })
      .returning();

    // Table 2: closed session earlier today with paid (closed) orders.
    const t2 = tableByLabel.get("2")!;
    const s2 = (
      await db
        .insert(tableSessions)
        .values({
          venue_id: venueId,
          table_id: t2.id,
          opened_at: min(210),
          closed_at: min(150),
          status: "closed",
          total: 20.5,
        })
        .returning()
    )[0];
    const daiquiri = itemByName.get("Golden Daiquiri")!;
    const platter = itemByName.get("Meze Platter")!;
    const closed1 = (
      await db
        .insert(orders)
        .values({
          venue_id: venueId,
          table_id: t2.id,
          session_id: s2.id,
          status: "closed",
          source: "wheel",
          total: 8.5,
          created_at: min(200),
          closed_at: min(195),
        })
        .returning()
    )[0];
    await db.insert(orderLines).values([
      { order_id: closed1.id, menu_item_id: daiquiri.id, name_snapshot: "Golden Daiquiri", price_snapshot: 8.5, qty: 1 },
    ]);
    const closed2 = (
      await db
        .insert(orders)
        .values({
          venue_id: venueId,
          table_id: t2.id,
          session_id: s2.id,
          status: "closed",
          source: "menu",
          total: 12,
          created_at: min(170),
          closed_at: min(150),
        })
        .returning()
    )[0];
    await db.insert(orderLines).values([
      { order_id: closed2.id, menu_item_id: platter.id, name_snapshot: "Meze Platter", price_snapshot: 12, qty: 1 },
    ]);

    // Analytics flavour.
    const wheelSour = itemByName.get("Ambrosia Sour")!;
    await db.insert(wheelSpins).values([
      { venue_id: venueId, table_id: t12.id, menu_item_id: wheelSour.id, spun_at: min(55) },
      { venue_id: venueId, table_id: t3.id, menu_item_id: aperol.id, spun_at: min(30) },
      { venue_id: venueId, table_id: t7.id, menu_item_id: null, spun_at: min(12) },
    ]);
    await db.insert(menuViews).values([
      { venue_id: venueId, table_id: t12.id, viewed_at: min(95) },
      { venue_id: venueId, table_id: t3.id, viewed_at: min(6) },
      { venue_id: venueId, table_id: t7.id, viewed_at: min(24) },
      { venue_id: venueId, table_id: t2.id, viewed_at: min(210) },
      { venue_id: venueId, table_id: t12.id, viewed_at: min(2) },
    ]);
  } catch (err) {
    // Another concurrent request may have seeded already (unique violation).
    const code = (err as { code?: string })?.code;
    if (code !== "23505") throw err;
  }
}


