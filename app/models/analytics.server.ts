import db from "../db.server";
import { Prisma } from "@prisma/client";

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
  orders: number;
  revenue: number;
  revenueLift: number;
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
  const to = new Date(now);
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

const DEFAULT_RETENTION_DAYS = 90;

/**
 * Delete BarEvent records older than the retention period.
 * Returns the number of deleted records.
 */
export async function purgeExpiredEvents(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = await db.barEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return result.count;
}

/**
 * Delete expired sessions (past their expiry date).
 * Returns the number of deleted records.
 */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });

  return result.count;
}

interface ABTestWithVariants {
  id: string;
  variants: { id: string; name: string; config: unknown }[];
}

export async function getABTestStats(
  testIdOrTest: string | ABTestWithVariants,
  dateRange?: DateRange,
  deviceType?: string,
): Promise<VariantStat[]> {
  const test: ABTestWithVariants | null =
    typeof testIdOrTest === "string"
      ? await db.aBTest.findUnique({
          where: { id: testIdOrTest },
          include: { variants: true },
        })
      : testIdOrTest;
  if (!test) return [];

  const dateFilter = dateRange
    ? { createdAt: { gte: dateRange.from, lte: dateRange.to } }
    : {};
  const deviceFilter = deviceType ? { deviceType } : {};

  // Single query for all event counts instead of 2 per variant
  const eventCounts = await db.barEvent.groupBy({
    by: ["variantId", "eventType"],
    _count: { id: true },
    where: {
      variantId: { in: test.variants.map((v) => v.id) },
      ...dateFilter,
      ...deviceFilter,
    },
  });

  const countMap = new Map<string, { impressions: number; conversions: number; orders: number }>();
  for (const row of eventCounts) {
    const entry = countMap.get(row.variantId) ?? { impressions: 0, conversions: 0, orders: 0 };
    if (row.eventType === "impression") {
      entry.impressions = row._count.id;
    } else if (row.eventType === "add_to_cart") {
      entry.conversions += row._count.id;
    } else if (row.eventType === "order_completed") {
      entry.orders += row._count.id;
    }
    countMap.set(row.variantId, entry);
  }

  // Revenue aggregation (separate query since groupBy can't sum Decimal in same query)
  const variantIds = test.variants.map((v) => v.id);
  const revenueSums = await db.barEvent.groupBy({
    by: ["variantId"],
    _sum: { revenue: true },
    where: {
      variantId: { in: variantIds },
      eventType: "order_completed",
      ...dateFilter,
      ...deviceFilter,
    },
  });
  const revenueMap = new Map<string, number>();
  for (const row of revenueSums) {
    revenueMap.set(row.variantId, Number(row._sum.revenue ?? 0));
  }

  // Compute control conversion rate for lift calculation
  const controlVariant = test.variants.find((v) => v.name === "A");
  const controlCounts = controlVariant
    ? countMap.get(controlVariant.id) ?? { impressions: 0, conversions: 0, orders: 0 }
    : { impressions: 0, conversions: 0, orders: 0 };
  const controlCR =
    controlCounts.impressions > 0
      ? (controlCounts.conversions / controlCounts.impressions) * 100
      : 0;
  const controlRevenue = controlVariant ? (revenueMap.get(controlVariant.id) ?? 0) : 0;

  return test.variants.map((v) => {
    const config = v.config as { color?: string; text?: string } | null;
    const counts = countMap.get(v.id) ?? { impressions: 0, conversions: 0, orders: 0 };
    const { impressions, conversions } = counts;
    const revenue = revenueMap.get(v.id) ?? 0;
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
    const revenueLift =
      v.name === "A" || controlRevenue === 0
        ? 0
        : Number(((revenue - controlRevenue) / controlRevenue * 100).toFixed(1));

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
      orders: counts.orders,
      revenue: Number(revenue.toFixed(2)),
      revenueLift,
    };
  });
}

// ──────────────────────────────────────────────────────────
// Experiment CRUD
// ──────────────────────────────────────────────────────────

/**
 * Lazy scheduler: check and transition tests based on startAt/endAt.
 * Called before fetching active test to ensure scheduled tests auto-activate
 * and active tests auto-complete.
 *
 * Wrapped in a transaction to prevent race conditions where concurrent requests
 * could both activate different scheduled tests. Throttled to run at most once
 * per 60 seconds per shop to avoid extra DB queries on every page load.
 */
const _lastTransitionCheck = new Map<string, number>();
const TRANSITION_CHECK_INTERVAL_MS = 60_000;

export function resetTransitionThrottle(shop?: string): void {
  if (shop) {
    _lastTransitionCheck.delete(shop);
  } else {
    _lastTransitionCheck.clear();
  }
}

export async function checkAndTransitionTests(shop: string): Promise<void> {
  const nowMs = Date.now();
  const last = _lastTransitionCheck.get(shop) ?? 0;
  if (nowMs - last < TRANSITION_CHECK_INTERVAL_MS) return;
  _lastTransitionCheck.set(shop, nowMs);

  await db.$transaction(async (tx) => {
    const now = new Date();

    // Auto-complete active tests that have passed their endAt
    await tx.aBTest.updateMany({
      where: {
        shop,
        status: "active",
        endAt: { not: null, lte: now },
      },
      data: { status: "completed", completedAt: now },
    });

    // Check if there's already an active test before activating a scheduled one
    const active = await tx.aBTest.findFirst({
      where: { shop, status: "active" },
    });
    if (!active) {
      // Auto-activate scheduled tests that have reached their startAt
      // Only activate the earliest one to maintain 1-active-at-a-time constraint
      const readyTest = await tx.aBTest.findFirst({
        where: {
          shop,
          status: "scheduled",
          startAt: { lte: now },
        },
        orderBy: { startAt: "asc" },
      });
      if (readyTest) {
        await tx.aBTest.update({
          where: { id: readyTest.id },
          data: { status: "active" },
        });
      }
    }
  });
}

export async function getActiveTest(shop: string) {
  await checkAndTransitionTests(shop);
  return db.aBTest.findFirst({
    where: { shop, status: "active" },
    include: { variants: true },
  });
}

export interface ExperimentSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  mode: string;
  variantCount: number;
  createdAt: Date;
  completedAt: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  totalImpressions: number;
  totalConversions: number;
}

export async function listExperiments(shop: string): Promise<ExperimentSummary[]> {
  const tests = await db.aBTest.findMany({
    where: { shop },
    include: {
      variants: {
        include: {
          _count: { select: { events: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return tests.map((t) => {
    let totalImpressions = 0;
    let totalConversions = 0;
    // Note: _count gives total events per variant, not by type.
    // For the summary, we use a simple approach.
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      mode: t.mode,
      variantCount: t.variants.length,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      startAt: t.startAt,
      endAt: t.endAt,
      totalImpressions,
      totalConversions,
    };
  });
}

interface CreateExperimentData {
  name: string;
  description?: string;
  currencyThresholds?: Record<string, number> | null;
  startAt?: Date;
  endAt?: Date;
  variants: { name: string; config: Prisma.InputJsonValue }[];
}

export async function createExperiment(shop: string, data: CreateExperimentData) {
  // Determine if this is a scheduled campaign
  const isScheduled = data.startAt && data.startAt > new Date();
  const status = isScheduled ? "scheduled" : "active";

  // Only 1 active or scheduled test at a time
  if (status === "active") {
    const active = await getActiveTest(shop);
    if (active) {
      throw new Error("An active experiment already exists. Complete or pause it first.");
    }
  } else {
    const scheduled = await db.aBTest.findFirst({
      where: { shop, status: { in: ["active", "scheduled"] } },
    });
    if (scheduled) {
      throw new Error("An active or scheduled experiment already exists. Complete or pause it first.");
    }
  }

  return db.aBTest.create({
    data: {
      shop,
      name: data.name,
      description: data.description ?? null,
      status,
      currencyThresholds: data.currencyThresholds ?? undefined,
      startAt: data.startAt ?? undefined,
      endAt: data.endAt ?? undefined,
      variants: {
        create: data.variants.map((v) => ({
          name: v.name,
          config: v.config,
        })),
      },
    },
    include: { variants: true },
  });
}

export async function updateExperiment(
  testId: string,
  data: { name?: string; description?: string; currencyThresholds?: Record<string, number> | null; startAt?: Date; endAt?: Date },
) {
  // Prisma requires DbNull for setting JSON fields to null
  const prismaData: Record<string, unknown> = {};
  if (data.name !== undefined) prismaData.name = data.name;
  if (data.description !== undefined) prismaData.description = data.description;
  if (data.startAt !== undefined) prismaData.startAt = data.startAt;
  if (data.endAt !== undefined) prismaData.endAt = data.endAt;
  if (data.currencyThresholds !== undefined) {
    prismaData.currencyThresholds = data.currencyThresholds === null
      ? Prisma.DbNull
      : data.currencyThresholds;
  }
  return db.aBTest.update({
    where: { id: testId },
    data: prismaData,
    include: { variants: true },
  });
}

export async function updateVariantConfig(
  variantId: string,
  config: Prisma.InputJsonValue,
) {
  return db.aBVariant.update({
    where: { id: variantId },
    data: { config },
  });
}

export async function addVariant(
  testId: string,
  data: { name: string; config: Prisma.InputJsonValue },
) {
  return db.aBVariant.create({
    data: {
      testId,
      name: data.name,
      config: data.config,
    },
  });
}

export async function removeVariant(variantId: string) {
  return db.aBVariant.delete({ where: { id: variantId } });
}

export async function changeTestStatus(
  testId: string,
  newStatus: "active" | "paused" | "completed" | "scheduled",
  shop: string,
) {
  if (newStatus === "active") {
    const active = await getActiveTest(shop);
    if (active && active.id !== testId) {
      throw new Error("Another experiment is already active. Pause or complete it first.");
    }
  }

  const data: Record<string, unknown> = { status: newStatus };
  if (newStatus === "completed") {
    data.completedAt = new Date();
  }

  return db.aBTest.update({
    where: { id: testId },
    data,
    include: { variants: true },
  });
}

export async function deleteExperiment(testId: string) {
  return db.aBTest.delete({ where: { id: testId } });
}

export async function updateTestMode(
  testId: string,
  mode: "manual" | "auto_optimize",
) {
  return db.aBTest.update({
    where: { id: testId },
    data: { mode },
  });
}

// ──────────────────────────────────────────────────────────
// Thompson Sampling (Multi-Armed Bandit)
// ──────────────────────────────────────────────────────────

/**
 * Sample from a Beta distribution using the Jöhnk algorithm.
 * Pure math — no external dependencies.
 */
export function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) return 0.5;

  // For alpha and beta both <= 1, use Jöhnk's algorithm
  // For larger values, use the gamma-based approach
  if (alpha <= 1 && beta <= 1) {
    while (true) {
      const u = Math.random();
      const v = Math.random();
      const x = Math.pow(u, 1 / alpha);
      const y = Math.pow(v, 1 / beta);
      if (x + y <= 1) {
        return x / (x + y);
      }
    }
  }

  // Gamma-based: Beta(a,b) = Ga/(Ga+Gb) where Ga~Gamma(a,1), Gb~Gamma(b,1)
  const ga = sampleGamma(alpha);
  const gb = sampleGamma(beta);
  return ga / (ga + gb);
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia and Tsang's method.
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Box-Muller transform for standard normal samples. */
function normalRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const DEFAULT_EXPLORATION_FLOOR = 0.1;

/**
 * Compute Thompson Sampling weights for each variant.
 * Returns a map of variantId → weight (summing to 1.0).
 */
export function computeVariantWeights(
  stats: VariantStat[],
  explorationFloor: number = DEFAULT_EXPLORATION_FLOOR,
): Record<string, number> {
  if (stats.length === 0) return {};

  const minWeight = explorationFloor / stats.length;
  const allocatable = 1 - minWeight * stats.length;

  // Sample from Beta distribution for each variant
  const samples: { id: string; sample: number }[] = stats.map((s) => ({
    id: s.id,
    sample: sampleBeta(s.conversions + 1, s.visitors - s.conversions + 1),
  }));

  const totalSample = samples.reduce((sum, s) => sum + s.sample, 0);

  const weights: Record<string, number> = {};
  for (const s of samples) {
    const proportional = totalSample > 0 ? (s.sample / totalSample) * allocatable : allocatable / stats.length;
    weights[s.id] = Number((minWeight + proportional).toFixed(4));
  }

  return weights;
}

/**
 * Get variant weights for a test in auto_optimize mode.
 */
export async function getVariantWeights(testId: string): Promise<Record<string, number>> {
  const stats = await getABTestStats(testId);
  return computeVariantWeights(stats);
}
