import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import { getOrCreateABTest, getABTestStats } from "./analytics.server";

const mockDb = db as any;
const mockTestId = "test-id-123";
const MOCK_TEST = {
  id: mockTestId,
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

describe("analytics.server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return existing test if it exists", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(MOCK_TEST);
    const result = await getOrCreateABTest("test-shop.myshopify.com");
    expect(result).toEqual(MOCK_TEST);
    expect(mockDb.aBTest.create).not.toHaveBeenCalled();
  });

  it("should calculate correct stats with z-test confidence", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    // Control: 5% CR, B: 15% CR, C: ~33% CR — strong effects with enough data
    mockDb.barEvent.groupBy.mockImplementation(
      makeGroupByMock({
        "v-a": { impression: 200, conversion: 10 },
        "v-b": { impression: 200, conversion: 30 },
        "v-c": { impression: 200, conversion: 10 },
      })
    );
    const stats = await getABTestStats(mockTestId);
    expect(stats[0].visitors).toBe(200);
    expect(stats[0].conversions).toBe(10);
    expect(stats[0].status).toBe("Control"); // Variant A is always Control
    expect(stats[1].visitors).toBe(200);
    expect(stats[1].status).toBe("Winning"); // B has high lift + high confidence
    expect(stats[1].confidence).toBeGreaterThanOrEqual(95);
  });

  it("should show zeros and Collecting status when no events recorded", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.groupBy.mockResolvedValue([]);
    const stats = await getABTestStats(mockTestId);
    expect(stats[0].conversionRate).toBe(0);
    expect(stats[0].lift).toBe(0);
    expect(stats[0].status).toBe("Control");
    expect(stats[1].status).toBe("Collecting");
  });
});
