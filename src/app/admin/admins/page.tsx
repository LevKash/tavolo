import { requireUser } from "@/lib/auth";
import { listAdminUsers } from "@/lib/core";
import { DemoteButton, PromoteForm } from "./admin-forms";

export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  const me = await requireUser();
  const admins = await listAdminUsers();

  return (
    <>
      <h1 className="serif text-2xl font-semibold text-cream">Admins</h1>
      <p className="mt-1 text-xs text-fog">
        Platform admins see every venue and this panel. Promote an existing
        account by email — they must have signed up first.
      </p>

      <section className="mt-6 rounded-xl border border-line bg-ink-2 p-4">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          Promote by email
        </h2>
        <PromoteForm />
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          Current admins · {admins.length}
        </h2>
        {admins.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-line/60 bg-ink-2/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-cream">
                {u.name}
                <span className="ml-2 font-normal text-fog-2">{u.email}</span>
                {u.id === me.id && (
                  <span className="ml-2 rounded border border-gold/30 bg-gold/10 px-1 py-px text-[9px] font-bold uppercase text-gold-2">
                    you
                  </span>
                )}
              </p>
            </div>
            <DemoteButton
              userId={u.id}
              email={u.email}
              disabled={u.id === me.id || admins.length <= 1}
            />
          </div>
        ))}
      </section>
    </>
  );
}
