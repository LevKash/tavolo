"use client";

import { useRouter } from "next/navigation";
import { logoutAction } from "@/lib/actions";

/**
 * Full-screen gate shown inside the dashboard shell while a venue is not yet
 * approved (pending) or was declined (rejected). Rendered instead of the app.
 */
export default function ReviewGate({
  status,
  venueName,
}: {
  status: string;
  venueName: string;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-ink-2 p-8 text-center">
        <p className="serif text-3xl font-semibold text-cream">
          Ordavo<span className="text-gold">.</span>
        </p>
        {status === "pending" ? (
          <>
            <h1 className="mt-6 text-lg font-bold text-cream">
              Application under review
            </h1>
            <p className="mt-2 text-sm text-gold-2">{venueName}</p>
            <p className="mt-4 text-sm leading-relaxed text-fog">
              Thanks! Every new venue is reviewed by our team before going live.
              We&apos;ll email you as soon as yours is approved — usually within a
              day. Until then your menu stays private.
            </p>
          </>
        ) : status === "archived" ? (
          <>
            <h1 className="mt-6 text-lg font-bold text-cream">
              Venue archived
            </h1>
            <p className="mt-2 text-sm text-fog">{venueName}</p>
            <p className="mt-4 text-sm leading-relaxed text-fog">
              This venue has been taken offline by the Ordavo team. Your menu,
              tables and order history are kept safe. To bring it back, write to{" "}
              <a
                href="mailto:contact@levkashkin.eu"
                className="text-gold-2 hover:text-gold-3"
              >
                contact@levkashkin.eu
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-lg font-bold text-cream">
              Application declined
            </h1>
            <p className="mt-2 text-sm text-fog">{venueName}</p>
            <p className="mt-4 text-sm leading-relaxed text-fog">
              We couldn&apos;t approve this venue application. If you think this is a
              mistake, write to{" "}
              <a
                href="mailto:contact@levkashkin.eu"
                className="text-gold-2 hover:text-gold-3"
              >
                contact@levkashkin.eu
              </a>
              .
            </p>
          </>
        )}
        <button
          onClick={async () => {
            await logoutAction();
            router.push("/");
            router.refresh();
          }}
          className="btn btn-ghost mt-6 w-full !py-2 text-xs"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
