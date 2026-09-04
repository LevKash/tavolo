"use client";

import { approveVenueAction, rejectVenueAction } from "@/lib/actions";

/** Approve button with an explicit confirm — unlocks the owner's dashboard. */
export function ApproveForm({
  venueId,
  venueName,
}: {
  venueId: string;
  venueName: string;
}) {
  return (
    <form
      action={async () => {
        await approveVenueAction(venueId);
      }}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Approve "${venueName}"?\n\nThe owner's dashboard unlocks immediately and their menu can go live.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="btn btn-gold !px-3 !py-1.5 text-xs font-bold"
      >
        Approve
      </button>
    </form>
  );
}

/** Decline button with an explicit confirm — shows the owner a "declined" screen. */
export function DeclineForm({
  venueId,
  venueName,
}: {
  venueId: string;
  venueName: string;
}) {
  return (
    <form
      action={async () => {
        await rejectVenueAction(venueId);
      }}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Decline "${venueName}"?\n\nThe owner will see an "application declined" screen.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="btn btn-ghost !px-3 !py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/10"
      >
        Decline
      </button>
    </form>
  );
}
