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
  const existing = await db.aBTest.findFirst({
    where: { shop },
    include: { variants: true },
  });
  if (existing) return existing;

  try {
    return await db.aBTest.create({
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
  } catch {
    // Another request may have created the test concurrently — re-fetch
    const raced = await db.aBTest.findFirst({
      where: { shop },
      include: { variants: true },
    });
    if (!raced) throw new Error(`Failed to create AB test for ${shop}`);
    return raced;
  }
}

export async function getABTestStats(testId: string): Promise<VariantStat[]> {
  const test = await db.aBTest.findUnique({
    where: { id: testId },
    include: { variants: true },
  });
  if (!test) return [];

  // Single query for all event counts instead of 2 per variant
  const eventCounts = await db.barEvent.groupBy({
    by: ["variantId", "eventType"],
    _count: { id: true },
    where: { variantId: { in: test.variants.map((v) => v.id) } },
  });

  const countMap = new Map<string, { impressions: number; conversions: number }>();
  for (const row of eventCounts) {
    const entry = countMap.get(row.variantId) ?? { impressions: 0, conversions: 0 };
    if (row.eventType === "impression") {
      entry.impressions = row._count.id;
    } else if (row.eventType === "conversion" || row.eventType === "add_to_cart") {
      entry.conversions += row._count.id;
    }
    countMap.set(row.variantId, entry);
  }

  // Compute control conversion rate for lift calculation
  const controlVariant = test.variants.find((v) => v.name === "A");
  const controlCounts = controlVariant
    ? countMap.get(controlVariant.id) ?? { impressions: 0, conversions: 0 }
    : { impressions: 0, conversions: 0 };
  const controlCR =
    controlCounts.impressions > 0
      ? (controlCounts.conversions / controlCounts.impressions) * 100
      : 0;

  return test.variants.map((v) => {
    const config = v.config as { color?: string; text?: string } | null;
    const counts = countMap.get(v.id) ?? { impressions: 0, conversions: 0 };
    const { impressions, conversions } = counts;
    const conversionRate = impressions > 0 ? (conversions / impressions) * 100 : 0;
    const lift =
      v.name === "A" || controlCR === 0
        ? 0
        : Number(((conversionRate - controlCR) / controlCR * 100).toFixed(1));
    const status =
      conversionRate >= 4 ? "Winning" : conversionRate >= 2 ? "Stable" : "Improving";

    return {
      id: v.id,
      variant: v.name,
      color: config?.color ?? "#4CAF50",
      visitors: impressions,
      conversions,
      conversionRate: Number(conversionRate.toFixed(2)),
      lift,
      confidence:
        impressions > 30 ? 95 : impressions > 10 ? 75 : impressions > 0 ? 50 : 0,
      status,
    };
  });
}
