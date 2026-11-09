/**
 * Next.js calls this for every error that escapes a route, page or server
 * action. We forward it to the operator's Telegram (throttled, see monitor.ts).
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/monitor");
  // Strip query strings: they can carry a PIN from older clients.
  const path = (context.routePath || request.path || "").split("?")[0];
  await reportError(path, err, {
    method: request.method,
    digest: (err as { digest?: string })?.digest,
  });
}
