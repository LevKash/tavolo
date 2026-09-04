import { requireUser } from "@/lib/auth";
import { listAdminUsers, listAllAccounts } from "@/lib/core";
import { DeleteAccountButton, DemoteButton, PromoteForm } from "./admin-forms";

export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  const me = await requireUser();
  const admins = await listAdminUsers();
  const accounts = await listAllAccounts();

  return (
    <>
      <h1 className="serif text-2xl font-semibold text-cream">Accounts</h1>
      <p className="mt-1 text-xs text-fog">
        Platform admins see every venue and this panel. Promote an existing
        account by email — they must have signed up first. Accounts with no
        venues can be deleted to free their email for a new signup.
      </p>

      <section className="mt-6 rounded-xl border border-line bg-ink-2 p-4">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          Promote by email
        </h2>
        <PromoteForm />
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
          All accounts · {accounts.length}
        </h2>
        {accounts.map((u) => {
          const isMe = u.id === me.id;
          const isAdmin = u.is_admin;
          const isLastAdmin = isAdmin && admins.length <= 1;
          const hasVenues = u.venueCount > 0;
          const deleteDisabled = isMe || hasVenues || isLastAdmin;
          const deleteTitle = isMe
            ? "You can't delete your own account"
            : hasVenues
              ? "Owns venues — delete them first (Venues → Delete forever)"
              : isLastAdmin
                ? "There must always be at least one admin"
                : undefined;
          return (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line/60 bg-ink-2/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-cream">
                  {u.name}
                  <span className="ml-2 font-normal text-fog-2">{u.email}</span>
                  {isAdmin && (
                    <span className="ml-2 rounded border border-gold/30 bg-gold/10 px-1 py-px text-[9px] font-bold uppercase text-gold-2">
                      admin
                    </span>
                  )}
                  {isMe && (
                    <span className="ml-2 rounded border border-line bg-ink-1 px-1 py-px text-[9px] font-bold uppercase text-fog-2">
                      you
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-fog">
                  {hasVenues
                    ? `Owns ${u.venueCount} ${u.venueCount === 1 ? "venue" : "venues"}`
                    : "No venues"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isAdmin && (
                  <DemoteButton
                    userId={u.id}
                    email={u.email}
                    disabled={isMe || isLastAdmin}
                  />
                )}
                <DeleteAccountButton
                  userId={u.id}
                  email={u.email}
                  disabled={deleteDisabled}
                  disabledTitle={deleteTitle}
                />
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
