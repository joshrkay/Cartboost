import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import { getOrCreateABTest, getABTestStats } from "../models/analytics.server";
import { authenticate } from "../shopify.server";
import { loader } from "../routes/app._index";

vi.mock("../models/analytics.server", () => ({
  getOrCreateABTest: vi.fn(),
  getABTestStats: vi.fn(),
  computeDateRange: vi.fn().mockReturnValue({ from: new Date(), to: new Date() }),
  getDateRangeLabel: vi.fn().mockReturnValue("Last 7 days"),
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
  PLAN_PRICES: { pro: { amount: 7.99, currencyCode: "USD" }, premium: { amount: 10.99, currencyCode: "USD" } },
}));

vi.mock("@shopify/shopify-app-react-router/server", () => ({
  boundary: { headers: vi.fn() },
}));

const mockDb = db as any;
const mockGetOrCreateABTest = getOrCreateABTest as ReturnType<typeof vi.fn>;
const mockGetABTestStats = getABTestStats as ReturnType<typeof vi.fn>;
const mockAuthenticate = authenticate as unknown as { admin: ReturnType<typeof vi.fn> };

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

describe("dashboard loader — failure fallback (actual loader)", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockShop(shop: string) {
    mockAuthenticate.admin.mockResolvedValue({ session: { shop } });
  }

  function makeRequest() {
    return new Request("http://test-shop/app");
  }

  it("returns empty variants when getOrCreateABTest throws, but defaults plan to free", async () => {
    mockShop("failing-shop.myshopify.com");
    mockGetOrCreateABTest.mockRejectedValue(new Error("DB connection lost"));
    mockDb.shopPlan.findUnique.mockResolvedValue(null);

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.shop).toBe("failing-shop.myshopify.com");
    expect(data.variants).toEqual([]);
    expect(data.currentPlan).toBe("free");
  });

  it("preserves paid plan when only analytics queries fail", async () => {
    mockShop("shop.myshopify.com");
    mockDb.shopPlan.findUnique.mockResolvedValue({ plan: "pro" });
    mockGetOrCreateABTest.mockRejectedValue(new Error("DB connection lost"));

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants).toEqual([]);
    expect(data.currentPlan).toBe("pro");
  });

  it("preserves paid plan when getABTestStats throws", async () => {
    mockShop("shop.myshopify.com");
    mockDb.shopPlan.findUnique.mockResolvedValue({ plan: "premium" });
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "shop.myshopify.com", variants: [] });
    mockGetABTestStats.mockRejectedValue(new Error("Query timeout"));

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants).toEqual([]);
    expect(data.currentPlan).toBe("premium");
  });

  it("falls back to free plan when shopPlan query throws", async () => {
    mockShop("shop.myshopify.com");
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "shop.myshopify.com", variants: [] });
    mockGetABTestStats.mockResolvedValue([]);
    mockDb.shopPlan.findUnique.mockRejectedValue(new Error("Table not found"));

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants).toEqual([]);
    expect(data.currentPlan).toBe("free");
  });

  it("returns real data when all queries succeed", async () => {
    mockShop("shop.myshopify.com");
    const fakeVariants = [{ id: "v1", variant: "A", visitors: 100, conversions: 10 }];
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "shop.myshopify.com", variants: [] });
    mockGetABTestStats.mockResolvedValue(fakeVariants);
    mockDb.shopPlan.findUnique.mockResolvedValue({ plan: "pro" });

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants).toEqual(fakeVariants);
    expect(data.currentPlan).toBe("pro");
  });
});

describe("dashboard — zero state vs populated state (regression)", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockShop(shop: string) {
    mockAuthenticate.admin.mockResolvedValue({ session: { shop } });
  }

  function makeRequest(query = "") {
    return new Request(`http://test-shop/app${query}`);
  }

  it("returns variants.length === 0 for a brand-new shop with no experiments (triggers empty state)", async () => {
    mockShop("new-merchant.myshopify.com");
    mockDb.shopPlan.findUnique.mockResolvedValue(null);
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "new-merchant.myshopify.com" });
    mockGetABTestStats.mockResolvedValue([]);

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants).toEqual([]);
    expect(data.variants.length).toBe(0);
  });

  it("returns populated variants for a shop with active experiments (triggers data view)", async () => {
    mockShop("active-merchant.myshopify.com");
    mockDb.shopPlan.findUnique.mockResolvedValue({ plan: "pro" });
    const populatedVariants = [
      { id: "v1", variant: "A", visitors: 500, conversions: 50, conversionRate: 10, lift: 0, confidence: 0, status: "Control" },
      { id: "v2", variant: "B", visitors: 480, conversions: 72, conversionRate: 15, lift: 50, confidence: 96, status: "Winning" },
    ];
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "active-merchant.myshopify.com" });
    mockGetABTestStats.mockResolvedValue(populatedVariants);

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants.length).toBeGreaterThan(0);
    expect(data.variants).toEqual(populatedVariants);
  });

  it("returns empty variants when analytics fail, triggering empty state even for existing shops", async () => {
    mockShop("existing-but-broken.myshopify.com");
    mockDb.shopPlan.findUnique.mockResolvedValue({ plan: "premium" });
    mockGetOrCreateABTest.mockRejectedValue(new Error("Connection reset"));

    const data = await loader({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants).toEqual([]);
    expect(data.variants.length).toBe(0);
    // Plan should still be preserved even when empty state is triggered
    expect(data.currentPlan).toBe("premium");
  });

  it("respects dateRange parameter in both empty and populated states", async () => {
    mockShop("shop.myshopify.com");
    mockDb.shopPlan.findUnique.mockResolvedValue(null);
    mockGetOrCreateABTest.mockResolvedValue({ id: "test-1", shop: "shop.myshopify.com" });
    mockGetABTestStats.mockResolvedValue([]);

    const data = await loader({ request: makeRequest("?dateRange=last30"), context: {}, params: {}, unstable_pattern: "" });
    expect(data.variants).toEqual([]);
    expect(data.dateRange).toBe("last30");
  });
});
