import db from "../db.server";

/**
 * Delete all data stored for a shop in a single transaction.
 * ABTest -> ABVariant -> BarEvent cascade automatically via onDelete: Cascade.
 * This is idempotent — safe to run multiple times if Shopify retries.
 */
export async function deleteAllShopData(shop: string): Promise<void> {
  await db.$transaction([
    db.aBTest.deleteMany({ where: { shop } }),
    db.shopPlan.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}
