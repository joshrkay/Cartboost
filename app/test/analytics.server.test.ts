import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import { getOrCreateABTest, getABTestStats, sampleBeta, computeVariantWeights } from "../models/analytics.server";

const mockDb = db as any;

const MOCK_TEST = {
  id: "test-id-123",
  shop: "test-shop.myshopify.com",
  name: "Initial Free Shipping Bar Test",
  mode: "manual",
  variants: [
    { id: "v-a", name: "A", config: { color: "#4CAF50", text: "Free shipping over $50" } },
    { id: "v-b", name: "B", config: { color: "#2196F3", text: "Limited Time: Free Shipping!" } },
    { id: "v-c", name: "C", config: { color: "#FF9800", text: "Get Free Shipping Today" } },
  ],
};

function makeGroupByMock(data: Record<string, Record<string, number>>) {
  // Returns a function that handles both event count and revenue groupBy calls
  return (args: any) => {
    // Second call is for revenue (has eventType: "order_completed" filter)
    if (args?.where?.eventType === "order_completed") {
      return Promise.resolve([]);
    }
    // First call: event counts
    const rows: Array<{ variantId: string; eventType: string; _count: { id: number } }> = [];
    for (const [variantId, events] of Object.entries(data)) {
      for (const [eventType, count] of Object.entries(events as Record<string, number>)) {
        if (count > 0) {
          rows.push({ variantId, eventType, _count: { id: count } });
        }
      }
    }
    return Promise.resolve(rows);
  };
}

describe("getOrCreateABTest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing test if one exists for the shop", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(MOCK_TEST);
    const result = await getOrCreateABTest("test-shop.myshopify.com");
    expect(result).toEqual(MOCK_TEST);
    expect(mockDb.aBTest.create).not.toHaveBeenCalled();
  });

  it("creates a new test with A/B/C variants if none exists", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(null);
    mockDb.aBTest.create.mockResolvedValue(MOCK_TEST);
    const result = await getOrCreateABTest("test-shop.myshopify.com");
    expect(mockDb.aBTest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shop: "test-shop.myshopify.com",
          variants: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ name: "A" }),
              expect.objectContaining({ name: "B" }),
              expect.objectContaining({ name: "C" }),
            ]),
          }),
        }),
      })
    );
    expect(result.variants).toHaveLength(3);
  });

  it("handles race condition by re-fetching on create error", async () => {
    mockDb.aBTest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(MOCK_TEST);
    mockDb.aBTest.create.mockRejectedValue(new Error("Unique constraint failed"));
    const result = await getOrCreateABTest("test-shop.myshopify.com");
    expect(result).toEqual(MOCK_TEST);
  });
});

describe("getABTestStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array if test not found", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(null);
    expect(await getABTestStats("non-existent")).toEqual([]);
  });

  it("counts real impressions and conversions using groupBy", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 6, add_to_cart: 2 },
        "v-b": { impression: 5, add_to_cart: 3 },
        "v-c": { impression: 0, add_to_cart: 0 },
      })
    );
    const result = await getABTestStats("test-id-123");
    const varA = result.find(v => v.variant === "A")!;
    const varB = result.find(v => v.variant === "B")!;
    expect(varA.visitors).toBe(6);
    expect(varA.conversions).toBe(2);
    expect(varA.conversionRate).toBe(33.33);
    expect(varA.lift).toBe(0); // Control variant always 0
    expect(varB.visitors).toBe(5);
    expect(varB.conversions).toBe(3);
    expect(varB.conversionRate).toBe(60);
    expect(varB.lift).toBeGreaterThan(0);
  });

  it("shows zeros when no events recorded", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockResolvedValue([]);
    const result = await getABTestStats("test-id-123");
    result.forEach(v => {
      expect(v.visitors).toBe(0);
      expect(v.conversions).toBe(0);
      expect(v.conversionRate).toBe(0);
      expect(v.orders).toBe(0);
      expect(v.revenue).toBe(0);
    });
  });

  it("uses groupBy queries for event counts and revenue", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockResolvedValue([]);
    await getABTestStats("test-id-123");
    // Called twice: once for event counts, once for revenue
    expect(mockDb.barEvent.groupBy).toHaveBeenCalledTimes(2);
    expect(mockDb.barEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["variantId", "eventType"],
        where: { variantId: { in: ["v-a", "v-b", "v-c"] } },
      })
    );
  });

  it("includes add_to_cart events in conversions count", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation((args: any) => {
      if (args?.where?.eventType === "order_completed") return Promise.resolve([]);
      return Promise.resolve([
        { variantId: "v-a", eventType: "impression", _count: { id: 100 } },
        { variantId: "v-a", eventType: "add_to_cart", _count: { id: 5 } },
      ]);
    });
    const result = await getABTestStats("test-id-123");
    const varA = result.find(v => v.variant === "A")!;
    expect(varA.conversions).toBe(5);
  });

  // --- Confidence z-test tests ---

  it("confidence uses z-test and scales with sample size", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 1000, add_to_cart: 50 },
        "v-b": { impression: 1000, add_to_cart: 80 },
        "v-c": { impression: 10, add_to_cart: 1 },
      })
    );
    const result = await getABTestStats("test-id-123");
    const varB = result.find(v => v.variant === "B")!;
    const varC = result.find(v => v.variant === "C")!;
    // Large sample + large effect => high confidence
    expect(varB.confidence).toBeGreaterThan(90);
    // Small sample => lower confidence than large sample
    expect(varC.confidence).toBeLessThan(varB.confidence);
  });

  it("control variant always has 0 confidence and Control status", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 100, add_to_cart: 10 },
        "v-b": { impression: 100, add_to_cart: 10 },
        "v-c": { impression: 100, add_to_cart: 10 },
      })
    );
    const result = await getABTestStats("test-id-123");
    const varA = result.find(v => v.variant === "A")!;
    expect(varA.confidence).toBe(0);
    expect(varA.status).toBe("Control");
  });

  // --- Status tests based on lift + confidence ---

  it("status is Winning when lift is positive and confidence >= 95%", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    // Control: 5% CR, Variant B: 15% CR — large effect, large sample
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 200, add_to_cart: 10 },
        "v-b": { impression: 200, add_to_cart: 30 },
        "v-c": { impression: 200, add_to_cart: 10 },
      })
    );
    const result = await getABTestStats("test-id-123");
    const varB = result.find(v => v.variant === "B")!;
    expect(varB.status).toBe("Winning");
    expect(varB.confidence).toBeGreaterThanOrEqual(95);
    expect(varB.lift).toBeGreaterThan(0);
  });

  it("status is Losing when lift is negative with high confidence", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    // Control: 15% CR, Variant B: 5% CR — negative lift
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 200, add_to_cart: 30 },
        "v-b": { impression: 200, add_to_cart: 10 },
        "v-c": { impression: 200, add_to_cart: 30 },
      })
    );
    const result = await getABTestStats("test-id-123");
    const varB = result.find(v => v.variant === "B")!;
    expect(varB.status).toBe("Losing");
    expect(varB.lift).toBeLessThan(0);
  });

  it("status is Collecting when fewer than 5 impressions", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 100, add_to_cart: 5 },
        "v-b": { impression: 3, add_to_cart: 1 },
        "v-c": { impression: 0, add_to_cart: 0 },
      })
    );
    const result = await getABTestStats("test-id-123");
    const varB = result.find(v => v.variant === "B")!;
    const varC = result.find(v => v.variant === "C")!;
    expect(varB.status).toBe("Collecting");
    expect(varC.status).toBe("Collecting");
  });

  it("status is Collecting for all non-control variants when no events", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation(() => Promise.resolve([]));
    const result = await getABTestStats("test-id-123");
    const varA = result.find(v => v.variant === "A")!;
    const varB = result.find(v => v.variant === "B")!;
    expect(varA.status).toBe("Control");
    expect(varB.status).toBe("Collecting");
  });

  it("status is Stable when confidence is below 70%", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    // Small samples, similar rates — low confidence
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 20, add_to_cart: 2 },
        "v-b": { impression: 20, add_to_cart: 3 },
        "v-c": { impression: 20, add_to_cart: 2 },
      })
    );
    const result = await getABTestStats("test-id-123");
    const varB = result.find(v => v.variant === "B")!;
    expect(varB.confidence).toBeLessThan(70);
    expect(varB.status).toBe("Stable");
  });

  it("includes revenue data in variant stats", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation((args: any) => {
      if (args?.where?.eventType === "order_completed") {
        return Promise.resolve([
          { variantId: "v-a", _sum: { revenue: 100 }, _count: { id: 2 } },
          { variantId: "v-b", _sum: { revenue: 250 }, _count: { id: 5 } },
        ]);
      }
      return Promise.resolve([
        { variantId: "v-a", eventType: "impression", _count: { id: 100 } },
        { variantId: "v-a", eventType: "add_to_cart", _count: { id: 10 } },
        { variantId: "v-a", eventType: "order_completed", _count: { id: 2 } },
        { variantId: "v-b", eventType: "impression", _count: { id: 100 } },
        { variantId: "v-b", eventType: "add_to_cart", _count: { id: 15 } },
        { variantId: "v-b", eventType: "order_completed", _count: { id: 5 } },
      ]);
    });
    const result = await getABTestStats("test-id-123");
    const varA = result.find(v => v.variant === "A")!;
    const varB = result.find(v => v.variant === "B")!;
    expect(varA.revenue).toBe(100);
    expect(varA.orders).toBe(2);
    expect(varB.revenue).toBe(250);
    expect(varB.orders).toBe(5);
    expect(varB.revenueLift).toBe(150); // (250-100)/100 * 100
  });
});

describe("sampleBeta", () => {
  it("returns values between 0 and 1", () => {
    for (let i = 0; i < 100; i++) {
      const sample = sampleBeta(2, 5);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it("returns 0.5 for invalid parameters", () => {
    expect(sampleBeta(0, 1)).toBe(0.5);
    expect(sampleBeta(-1, 2)).toBe(0.5);
    expect(sampleBeta(1, 0)).toBe(0.5);
  });

  it("handles alpha and beta both <= 1 (Jöhnk algorithm)", () => {
    for (let i = 0; i < 50; i++) {
      const sample = sampleBeta(0.5, 0.5);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it("handles large alpha and beta (gamma-based)", () => {
    for (let i = 0; i < 50; i++) {
      const sample = sampleBeta(10, 20);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeVariantWeights", () => {
  it("returns empty object for empty stats", () => {
    expect(computeVariantWeights([])).toEqual({});
  });

  it("returns weights summing to approximately 1", () => {
    const stats = [
      { id: "v-a", variant: "A", color: "#000", visitors: 100, conversions: 10, conversionRate: 10, lift: 0, confidence: 0, status: "Control", orders: 0, revenue: 0, revenueLift: 0 },
      { id: "v-b", variant: "B", color: "#000", visitors: 100, conversions: 20, conversionRate: 20, lift: 100, confidence: 90, status: "Promising", orders: 0, revenue: 0, revenueLift: 0 },
    ];
    const weights = computeVariantWeights(stats);
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it("enforces exploration floor", () => {
    const stats = [
      { id: "v-a", variant: "A", color: "#000", visitors: 1000, conversions: 10, conversionRate: 1, lift: 0, confidence: 0, status: "Control", orders: 0, revenue: 0, revenueLift: 0 },
      { id: "v-b", variant: "B", color: "#000", visitors: 1000, conversions: 500, conversionRate: 50, lift: 4900, confidence: 99, status: "Winning", orders: 0, revenue: 0, revenueLift: 0 },
    ];
    const weights = computeVariantWeights(stats, 0.2);
    // Each variant should get at least 10% (0.2 / 2)
    expect(weights["v-a"]).toBeGreaterThanOrEqual(0.1);
    expect(weights["v-b"]).toBeGreaterThanOrEqual(0.1);
  });

  it("gives higher weight to better-converting variant on average", () => {
    const stats = [
      { id: "v-a", variant: "A", color: "#000", visitors: 1000, conversions: 50, conversionRate: 5, lift: 0, confidence: 0, status: "Control", orders: 0, revenue: 0, revenueLift: 0 },
      { id: "v-b", variant: "B", color: "#000", visitors: 1000, conversions: 200, conversionRate: 20, lift: 300, confidence: 99, status: "Winning", orders: 0, revenue: 0, revenueLift: 0 },
    ];
    // Run multiple times and check average
    let bHigherCount = 0;
    for (let i = 0; i < 100; i++) {
      const weights = computeVariantWeights(stats);
      if (weights["v-b"] > weights["v-a"]) bHigherCount++;
    }
    // With such a large difference, B should almost always get more weight
    expect(bHigherCount).toBeGreaterThan(80);
  });
});
