import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Delete all data associated with this shop.
  // Order matters due to foreign key constraints:
  // AnalyticsEvent → ABVariant → ABTest (cascade handles variants/events)
  // BarEvent, ShopPlan, Session are independent.

  const shopDomain = shop ?? payload?.shop_domain;

  if (!shopDomain) {
    console.error("Shop redact webhook missing shop identifier");
    return new Response(null, { status: 400 });
  }

  try {
    await db.$transaction(async (tx) => {
      // Delete analytics events for this shop
      await tx.analyticsEvent.deleteMany({ where: { shop: shopDomain } });
      // Delete AB tests (cascades to variants via onDelete: Cascade)
      await tx.aBTest.deleteMany({ where: { shop: shopDomain } });
      // Delete bar events
      await tx.barEvent.deleteMany({ where: { shopDomain } });
      // Delete shop plan
      await tx.shopPlan.deleteMany({ where: { shop: shopDomain } });
      // Delete sessions
      await tx.session.deleteMany({ where: { shop: shopDomain } });
    });

    console.log(`Shop redact completed for ${shopDomain} - all data deleted`);
  } catch (error) {
    console.error(`Shop redact failed for ${shopDomain}:`, error);
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 200 });
};
