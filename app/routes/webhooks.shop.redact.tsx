import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  try {
    // Delete all data stored for this shop in a single transaction.
    // ABTest -> ABVariant -> BarEvent cascade automatically via onDelete: Cascade.
    // This is idempotent — safe to run multiple times if Shopify retries.
    await db.$transaction([
      db.aBTest.deleteMany({ where: { shop } }),
      db.shopPlan.deleteMany({ where: { shop } }),
      db.session.deleteMany({ where: { shop } }),
    ]);

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Shop redact failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Internal Server Error", { status: 500 });
  }
};
