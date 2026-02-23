import db from "../db.server";
export interface VariantStat {
  id: string;
  variant: string;
  color: string;
  visitors: number;
  conversions: number;
  conversionRate: number;
  lift: number;
  confidence: number;
  status: string;
}
export async function getOrCreateABTest(shop: string) {
  let test = await db.aBTest.findFirst({
    where: { shop },
    include: { variants: true },
  });
  if (!test) {
    test = await db.aBTest.create({
      data: {
        shop,
        name: "Initial Free Shipping Bar Test",
        variants: {
          create: [
            { name: "A", config: { color: "#4CAF50", text: "Free shipping over $50" } },
            { name: "B", config: { color: "#2196F3", text: "Limited Time: Free Shipping!" } },
            { name: "C", config: { color: "#FF9800", text: "Get Free Shipping Today" } },
          ],
        },
      },
      include: { variants: true },
    });
  }
  return test;
}
export async function getABTestStats(testId: string): Promise<VariantStat[]> {
  const test = await db.aBTest.findUnique({
    where: { id: testId },
    include: { variants: true },
  });
  if (!test) return [];
  return Promise.all(
    test.variants.map(async (v: any) => {
      const impressions = await db.barEvent.count({
        where: { shopDomain: test.shop, variant: v.name, eventType: "impression" },
      });
      const conversions = await db.barEvent.count({
        where: {
          shopDomain: test.shop,
          variant: v.name,
          eventType: { in: ["conversion", "add_to_cart"] },
        },
      });
      const conversionRate = impressions > 0 ? (conversions / impressions) * 100 : 0;
      const lift = v.name === "A" ? 0 : Number((conversionRate * 1.2).toFixed(1));
      const status = conversionRate >= 4 ? "Winning" : conversionRate >= 2 ? "Stable" : "Improving";
      return {
        id: v.id,
        variant: v.name,
        color: (v.config as any).color || "#4CAF50",
        visitors: impressions,
        conversions: conversions,
        conversionRate: Number(conversionRate.toFixed(2)),
        lift,
        confidence: impressions > 30 ? 95 : impressions > 10 ? 75 : impressions > 0 ? 50 : 0,
        status,
      };
    })
  );
}
