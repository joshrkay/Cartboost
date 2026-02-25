import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import { getOrCreateABTest, getABTestStats } from "../models/analytics.server";

vi.mock("../models/analytics.server", () => ({
  getOrCreateABTest: vi.fn(),
  getABTestStats: vi.fn(),
}));

const mockDb = db as any;
const mockGetOrCreateABTest = getOrCreateABTest as ReturnType<typeof vi.fn>;
const mockGetABTestStats = getABTestStats as ReturnType<typeof vi.fn>;

/**
 * Tests for the dashboard loader logic:
 * - currentPlan query from ShopPlan table
 * - Leading variant computation (replaces hardcoded "Variation B is leading")
 * - Analytics summary values derived from real database stats
 */

// Mirrors the loader logic for currentPlan
async function loadCurrentPlan(shop: string): Promise<string> {
  const shopPlan = await db.shopPlan.findUnique({ where: { shop } });
  return (shopPlan as any)?.plan ?? "free";
}

// Mirrors the leading variant computation in the component
function computeLeadingVariant(
  variants: Array<{ variant: string; lift: number; visitors: number }>,
  totalVisitors: number
) {
  if (totalVisitors === 0 || variants.length === 0) return null;
  return variants.reduce((best, v) => (v.lift > best.lift ? v : best), variants[0]);
}

// Mirrors the analytics summary computation
function computeAnalyticsSummary(variants: Array<{ visitors: number; conversions: number; lift: number }>) {
  const totalVisitors = variants.reduce((sum, v) => sum + v.visitors, 0);
  const totalConversions = variants.reduce((sum, v) => sum + v.conversions, 0);
  const avgCR = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
  const bestLift = variants.length > 0 ? Math.max(...variants.map(v => v.lift)) : 0;
  return { totalVisitors, totalConversions, avgCR, bestLift };
}

describe("dashboard loader — currentPlan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 'free' when no ShopPlan record exists", async () => {
    mockDb.shopPlan.findUnique.mockResolvedValue(null);
    const plan = await loadCurrentPlan("new-shop.myshopify.com");
    expect(plan).toBe("free");
    expect(mockDb.shopPlan.findUnique).toHaveBeenCalledWith({
      where: { shop: "new-shop.myshopify.com" },
    });
  });

  it("returns 'pro' when ShopPlan has pro plan", async () => {
    mockDb.shopPlan.findUnique.mockResolvedValue({ id: "1", shop: "pro-shop.myshopify.com", plan: "pro" });
    const plan = await loadCurrentPlan("pro-shop.myshopify.com");
    expect(plan).toBe("pro");
  });

  it("returns 'premium' when ShopPlan has premium plan", async () => {
    mockDb.shopPlan.findUnique.mockResolvedValue({ id: "2", shop: "premium-shop.myshopify.com", plan: "premium" });
    const plan = await loadCurrentPlan("premium-shop.myshopify.com");
    expect(plan).toBe("premium");
  });
});

describe("dashboard — leading variant computation", () => {
  it("returns null when there are no visitors", () => {
    const variants = [
      { variant: "A", lift: 0, visitors: 0 },
      { variant: "B", lift: 0, visitors: 0 },
    ];
    const result = computeLeadingVariant(variants, 0);
    expect(result).toBeNull();
  });

  it("returns the variant with the highest lift", () => {
    const variants = [
      { variant: "A", lift: 0, visitors: 100 },
      { variant: "B", lift: 15.5, visitors: 80 },
      { variant: "C", lift: 8.2, visitors: 90 },
    ];
    const result = computeLeadingVariant(variants, 270);
    expect(result!.variant).toBe("B");
  });

  it("returns the first variant when all lifts are equal", () => {
    const variants = [
      { variant: "A", lift: 0, visitors: 50 },
      { variant: "B", lift: 0, visitors: 50 },
    ];
    const result = computeLeadingVariant(variants, 100);
    expect(result!.variant).toBe("A");
  });

  it("returns null for empty variants array", () => {
    const result = computeLeadingVariant([], 0);
    expect(result).toBeNull();
  });
});

describe("dashboard — analytics summary from real data", () => {
  it("computes totals from database-driven variant stats", () => {
    const variants = [
      { visitors: 100, conversions: 10, lift: 0 },
      { visitors: 80, conversions: 12, lift: 15.5 },
      { visitors: 90, conversions: 8, lift: 8.2 },
    ];
    const summary = computeAnalyticsSummary(variants);
    expect(summary.totalVisitors).toBe(270);
    expect(summary.totalConversions).toBe(30);
    expect(summary.avgCR).toBeCloseTo(11.11, 1);
    expect(summary.bestLift).toBe(15.5);
  });

  it("handles zero visitors without NaN", () => {
    const variants = [
      { visitors: 0, conversions: 0, lift: 0 },
      { visitors: 0, conversions: 0, lift: 0 },
    ];
    const summary = computeAnalyticsSummary(variants);
    expect(summary.totalVisitors).toBe(0);
    expect(summary.totalConversions).toBe(0);
    expect(summary.avgCR).toBe(0);
    expect(Number.isNaN(summary.avgCR)).toBe(false);
  });

  it("computes correctly with a single variant", () => {
    const variants = [{ visitors: 50, conversions: 5, lift: 0 }];
    const summary = computeAnalyticsSummary(variants);
    expect(summary.totalVisitors).toBe(50);
    expect(summary.totalConversions).toBe(5);
    expect(summary.avgCR).toBe(10);
    expect(summary.bestLift).toBe(0);
  });
});

/**
 * Mirrors the loadDashboardData helper and the loader's try/catch
 * from app/routes/app._index.tsx to verify safe fallback behavior.
 */
async function loadDashboardData(shop: string) {
  const test = await getOrCreateABTest(shop);
  const [variants, shopPlan] = await Promise.all([
    getABTestStats(test.id),
    db.shopPlan.findUnique({ where: { shop } }),
  ]);
  const currentPlan = (shopPlan as any)?.plan ?? "free";
  return { variants, currentPlan };
}

async function loaderWithFallback(shop: string) {
  try {
    const { variants, currentPlan } = await loadDashboardData(shop);
    return { shop, variants, currentPlan };
  } catch {
    return { shop, variants: [], currentPlan: "free" };
  }
}

describe("dashboard loader — failure fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to safe defaults when getOrCreateABTest throws", async () => {
    mockGetOrCreateABTest.mockRejectedValue(new Error("DB connection lost"));

    const result = await loaderWithFallback("failing-shop.myshopify.com");
    expect(result.shop).toBe("failing-shop.myshopify.com");
    expect(result.variants).toEqual([]);
    expect(result.currentPlan).toBe("free");
  });

  it("falls back to safe defaults when getABTestStats throws", async () => {
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "shop.myshopify.com", variants: [] });
    mockGetABTestStats.mockRejectedValue(new Error("Query timeout"));

    const result = await loaderWithFallback("shop.myshopify.com");
    expect(result.variants).toEqual([]);
    expect(result.currentPlan).toBe("free");
  });

  it("falls back to safe defaults when shopPlan query throws", async () => {
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "shop.myshopify.com", variants: [] });
    mockGetABTestStats.mockResolvedValue([]);
    mockDb.shopPlan.findUnique.mockRejectedValue(new Error("Table not found"));

    const result = await loaderWithFallback("shop.myshopify.com");
    expect(result.variants).toEqual([]);
    expect(result.currentPlan).toBe("free");
  });

  it("returns real data when all queries succeed", async () => {
    const fakeVariants = [{ id: "v1", variant: "A", visitors: 100, conversions: 10 }];
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "shop.myshopify.com", variants: [] });
    mockGetABTestStats.mockResolvedValue(fakeVariants);
    mockDb.shopPlan.findUnique.mockResolvedValue({ plan: "pro" });

    const result = await loaderWithFallback("shop.myshopify.com");
    expect(result.variants).toEqual(fakeVariants);
    expect(result.currentPlan).toBe("pro");
  });
});
