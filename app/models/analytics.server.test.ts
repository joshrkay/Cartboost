import { describe, it, expect, vi, beforeEach } from "vitest";
import { getABTestStats, getOrCreateABTest } from "./analytics.server";
import db from "../db.server";

// Mock the db.server module
vi.mock("../db.server", () => ({
    default: {
        aBTest: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        analyticsEvent: {
            count: vi.fn(),
            create: vi.fn(),
        },
    },
}));

describe("analytics.server", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getABTestStats", () => {
        it("should calculate correct stats for variants", async () => {
            const mockTestId = "test-123";
            const mockTest = {
                id: mockTestId,
                variants: [
                    { id: "v-a", name: "A", config: { color: "Green" } },
                    { id: "v-b", name: "B", config: { color: "Blue" } },
                ],
            };

            // Mock database responses
            (db.aBTest.findUnique as any).mockResolvedValue(mockTest);

            // Variant A: 100 impressions, 10 add_to_carts (10%)
            // Variant B: 50 impressions, 10 add_to_carts (20%)
            (db.analyticsEvent.count as any).mockImplementation((args: any) => {
                if (args.where.variantId === "v-a") {
                    return args.where.eventType === "impression" ? 100 : 10;
                }
                if (args.where.variantId === "v-b") {
                    return args.where.eventType === "impression" ? 50 : 10;
                }
                return 0;
            });

            const stats = await getABTestStats(mockTestId);

            expect(stats).toHaveLength(2);

            const variantA = stats.find(s => s.variant === "A");
            expect(variantA?.lift).toBe(10);
            expect(variantA?.status).toBe("Good");

            const variantB = stats.find(s => s.variant === "B");
            expect(variantB?.lift).toBe(20);
            expect(variantB?.status).toBe("Best");
        });

        it("should handle zero impressions without crashing", async () => {
            const mockTestId = "test-456";
            const mockTest = {
                id: mockTestId,
                variants: [{ id: "v-c", name: "C", config: { color: "Orange" } }],
            };

            (db.aBTest.findUnique as any).mockResolvedValue(mockTest);
            (db.analyticsEvent.count as any).mockResolvedValue(0);

            const stats = await getABTestStats(mockTestId);

            expect(stats[0].lift).toBe(9.4); // Should return fallback mock data if lift is 0
            expect(stats[0].status).toBe("Average");
        });
    });

    describe("getOrCreateABTest", () => {
        it("should return existing test if it exists", async () => {
            const mockShop = "test.myshopify.com";
            const mockExistingTest = { id: "existing-id", shop: mockShop };

            (db.aBTest.findFirst as any).mockResolvedValue(mockExistingTest);

            const result = await getOrCreateABTest(mockShop);

            expect(result).toEqual(mockExistingTest);
            expect(db.aBTest.create).not.toHaveBeenCalled();
        });

        it("should create a new test if none exists", async () => {
            const mockShop = "new-shop.myshopify.com";
            const mockNewTest = { id: "new-id", shop: mockShop };

            (db.aBTest.findFirst as any).mockResolvedValue(null);
            (db.aBTest.create as any).mockResolvedValue(mockNewTest);

            const result = await getOrCreateABTest(mockShop);

            expect(result).toEqual(mockNewTest);
            expect(db.aBTest.create).toHaveBeenCalled();
        });
    });
});
