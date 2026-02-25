import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // Delete all app data for this shop. ABVariant -> BarEvent cascade via onDelete: Cascade.
  // This is idempotent — safe to run multiple times if Shopify retries.
  try {
    await db.$transaction([
      db.aBTest.deleteMany({ where: { shop } }),
      db.shopPlan.deleteMany({ where: { shop } }),
      db.session.deleteMany({ where: { shop } }),
    ]);

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("App uninstall cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Internal Server Error", { status: 500 });
  }
};
