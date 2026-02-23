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

function makeCountMock(data: Record<string, Record<string, number>>) {
  return ({ where }: any) => {
    const variant = where?.variant;
    const eventType = where?.eventType?.in ? "conversion" : where?.eventType;
    return Promise.resolve(data?.[variant]?.[eventType] ?? 0);
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
  it("should calculate correct stats for variants from BarEvent with real data", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.count.mockImplementation(
      makeCountMock({
        A: { impression: 6, conversion: 2 },
        B: { impression: 5, conversion: 3 },
        C: { impression: 3, conversion: 1 },
      })
    );
    const stats = await getABTestStats(mockTestId);
    expect(stats[0].visitors).toBe(6);
    expect(stats[0].conversions).toBe(2);
    expect(stats[0].conversionRate).toBe(33.33);
    expect(stats[0].status).toBe("Winning");
    expect(stats[1].visitors).toBe(5);
    expect(stats[1].conversionRate).toBe(60);
  });
  it("should show zeros when no events recorded — no hardcoded fallbacks", async () => {
    mockDb.aBTest.findUnique.mockResolvedValue(MOCK_TEST);
    mockDb.barEvent.count.mockResolvedValue(0);
    const stats = await getABTestStats(mockTestId);
    expect(stats[0].conversionRate).toBe(0);
    expect(stats[0].lift).toBe(0);
    expect(stats[0].status).toBe("Improving");
  });
});
