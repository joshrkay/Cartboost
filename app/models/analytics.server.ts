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

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17).
 * Max error < 1.5e-7. No external library needed.
 */
function normCdf(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t *
      Math.exp((-absX * absX) / 2));
  return 0.5 * (1.0 + sign * y);
}

/**
 * Two-proportion z-test confidence (0–100).
 * Returns 0 when there is insufficient data.
 */
function computeConfidence(
  controlImpressions: number,
  controlConversions: number,
  variantImpressions: number,
  variantConversions: number,
): number {
  if (controlImpressions === 0 || variantImpressions === 0) return 0;

  const pC = controlConversions / controlImpressions;
  const pT = variantConversions / variantImpressions;
  const pooled =
    (controlConversions + variantConversions) /
    (controlImpressions + variantImpressions);

  if (pooled === 0 || pooled === 1) return 0;

  const se = Math.sqrt(
    pooled * (1 - pooled) * (1 / controlImpressions + 1 / variantImpressions),
  );
  if (se === 0) return 0;

  const z = Math.abs(pT - pC) / se;
  const confidence = (normCdf(z) - 0.5) * 2 * 100;
  return Number(confidence.toFixed(1));
}

/**
 * Derive variant status from lift direction and statistical confidence.
 */
function computeStatus(
  variantName: string,
  lift: number,
  confidence: number,
  impressions: number,
): string {
  if (variantName === "A") return "Control";
  if (impressions < 5) return "Collecting";
  if (confidence >= 95) return lift > 0 ? "Winning" : "Losing";
  if (confidence >= 70) return lift > 0 ? "Promising" : "Underperforming";
  return "Stable";
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

export interface DateRange {
  from: Date;
  to: Date;
}

const DATE_RANGE_LABELS: Record<string, string> = {
  last7: "Last 7 days",
  thisWeek: "This week",
  thisMonth: "This month",
  last30: "Last 30 days",
};

export function getDateRangeLabel(rangeKey: string): string {
  return DATE_RANGE_LABELS[rangeKey] ?? "Last 7 days";
}

export function computeDateRange(rangeKey: string): DateRange {
  const now = new Date();
  const to = now;
  let from: Date;

  switch (rangeKey) {
    case "thisWeek": {
      from = new Date(now);
      from.setDate(now.getDate() - now.getDay());
      from.setHours(0, 0, 0, 0);
      break;
    }
    case "thisMonth": {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    case "last30": {
      from = new Date(now);
      from.setDate(now.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case "last7":
    default: {
      from = new Date(now);
      from.setDate(now.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      break;
    }
  }

  return { from, to };
}

export async function getABTestStats(
  testId: string,
  dateRange?: DateRange,
): Promise<VariantStat[]> {
  const test = await db.aBTest.findUnique({
    where: { id: testId },
    include: { variants: true },
  });
  if (!test) return [];

  const dateFilter = dateRange
    ? { createdAt: { gte: dateRange.from, lte: dateRange.to } }
    : {};

  // Single query for all event counts instead of 2 per variant
  const eventCounts = await db.barEvent.groupBy({
    by: ["variantId", "eventType"],
    _count: { id: true },
    where: {
      variantId: { in: test.variants.map((v) => v.id) },
      ...dateFilter,
    },
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
    const confidence =
      v.name === "A"
        ? 0
        : computeConfidence(
            controlCounts.impressions,
            controlCounts.conversions,
            impressions,
            conversions,
          );
    const status = computeStatus(v.name, lift, confidence, impressions);

    return {
      id: v.id,
      variant: v.name,
      color: config?.color ?? "#4CAF50",
      visitors: impressions,
      conversions,
      conversionRate: Number(conversionRate.toFixed(2)),
      lift,
      confidence,
      status,
    };
  });
}
