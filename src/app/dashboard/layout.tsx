import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import DashNav from "./dash-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const venueRows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  const venue = venueRows[0];

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-ink-2/95 px-4 py-5">
        <div>
          <p className="serif text-2xl font-semibold text-cream">
            Tavolo<span className="text-gold">.</span>
          </p>
          <div className="mt-1 truncate text-xs text-fog">
            {venue ? venue.name : ""}
            {venue && (
              <span className="ml-1 rounded border border-gold/30 bg-gold/10 px-1 py-px text-[9px] font-bold uppercase text-gold-2">
                {venue.plan}
              </span>
            )}
          </div>
        </div>
        <DashNav
          slug={venue?.slug ?? ""}
          userName={user.name}
        />
      </aside>
      <main className="ml-60 min-w-0 flex-1 bg-ink">
        <div className="mx-auto max-w-5xl px-6 py-7">{children}</div>
      </main>
    </div>
  );
}
