import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import { getOrCreateABTest, getABTestStats } from "../models/analytics.server";

const mockDb = db as any;

const MOCK_TEST = {
  id: "test-id-123",
  shop: "test-shop.myshopify.com",
  name: "Initial Free Shipping Bar Test",
  variants: [
    { id: "v-a", name: "A", config: { color: "#4CAF50", text: "Free shipping over $50" } },
    { id: "v-b", name: "B", config: { color: "#2196F3", text: "Limited Time: Free Shipping!" } },
    { id: "v-c", name: "C", config: { color: "#FF9800", text: "Get Free Shipping Today" } },
  ],
};

function makeGroupByMock(data: Record<string, Record<string, number>>) {
  return () => {
    const rows: Array<{ variantId: string; eventType: string; _count: { id: number } }> = [];
    for (const [variantId, events] of Object.entries(data)) {
      for (const [eventType, count] of Object.entries(events)) {
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
        "v-a": { impression: 6, conversion: 2 },
        "v-b": { impression: 5, conversion: 3 },
        "v-c": { impression: 0, conversion: 0 },
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
    });
  });

  it("uses a single groupBy query instead of per-variant counts", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockResolvedValue([]);
    await getABTestStats("test-id-123");
    // Should make exactly 1 groupBy call, not 2*N count calls
    expect(mockDb.barEvent.groupBy).toHaveBeenCalledTimes(1);
    expect(mockDb.barEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["variantId", "eventType"],
        where: { variantId: { in: ["v-a", "v-b", "v-c"] } },
      })
    );
  });

  it("status is Winning when conversion rate >= 4%", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 10, conversion: 5 },
        "v-b": { impression: 10, conversion: 5 },
        "v-c": { impression: 10, conversion: 5 },
      })
    );
    const result = await getABTestStats("test-id-123");
    result.forEach(v => expect(v.status).toBe("Winning"));
  });

  it("status is Improving when conversion rate is 0%", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockResolvedValue([]);
    const result = await getABTestStats("test-id-123");
    result.forEach(v => expect(v.status).toBe("Improving"));
  });

  it("includes add_to_cart events in conversions count", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockResolvedValue([
      { variantId: "v-a", eventType: "impression", _count: { id: 100 } },
      { variantId: "v-a", eventType: "conversion", _count: { id: 3 } },
      { variantId: "v-a", eventType: "add_to_cart", _count: { id: 2 } },
    ]);
    const result = await getABTestStats("test-id-123");
    const varA = result.find(v => v.variant === "A")!;
    expect(varA.conversions).toBe(5); // 3 + 2
  });
});
