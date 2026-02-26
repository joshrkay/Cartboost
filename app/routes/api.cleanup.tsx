import type { LoaderFunctionArgs } from "react-router";
import { purgeExpiredEvents, purgeExpiredSessions } from "../models/analytics.server";

/**
 * Cron-triggered cleanup endpoint. Purges old BarEvent records and expired sessions.
 *
 * Secured via a shared secret in the CLEANUP_SECRET env var.
 * Call: GET /api/cleanup?secret=<CLEANUP_SECRET>
 *
 * Can be triggered by Vercel Cron, GitHub Actions, or any external scheduler.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const expectedSecret = process.env.CLEANUP_SECRET;
  if (!expectedSecret) {
    return Response.json(
      { error: "CLEANUP_SECRET not configured" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [deletedEvents, deletedSessions] = await Promise.all([
      purgeExpiredEvents(),
      purgeExpiredSessions(),
    ]);

    console.log(
      `Cleanup completed: ${deletedEvents} expired events, ${deletedSessions} expired sessions`,
    );

    return Response.json({
      status: "ok",
      deletedEvents,
      deletedSessions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Cleanup failed" }, { status: 500 });
  }
};
