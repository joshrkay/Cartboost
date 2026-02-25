import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const shopDomain =
    (payload as any)?.shop_domain ?? shop;

  // Delete all data stored for this shop in a single transaction.
  // ABTest -> ABVariant -> BarEvent cascade automatically via onDelete: Cascade.
  // This is idempotent — safe to run multiple times if Shopify retries.
  await db.$transaction([
    db.aBTest.deleteMany({ where: { shop: shopDomain } }),
    db.shopPlan.deleteMany({ where: { shop: shopDomain } }),
    db.session.deleteMany({ where: { shop: shopDomain } }),
  ]);

  console.log(`Shop redact complete — all data deleted for ${shopDomain}`);

  return new Response(null, { status: 200 });
};
