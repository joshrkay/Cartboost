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
        barEvent: {
            count: vi.fn(),
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
        it("should calculate correct stats for variants from BarEvent with new high-fidelity interface", async () => {
            const mockTestId = "test-123";
            const mockShop = "test.myshopify.com";
            const mockTest = {
                id: mockTestId,
                shop: mockShop,
                variants: [
                    { id: "v-a", name: "A", config: { color: "Green" } },
                    { id: "v-b", name: "B", config: { color: "Blue" } },
                ],
            };

            // Mock database responses
            (db.aBTest.findUnique as any).mockResolvedValue(mockTest);

            // Variant A: 1000 impressions, 20 add_to_carts (2.0%) -> Stable
            // Variant B: 1000 impressions, 50 add_to_carts (5.0%) -> Winning
            (db.barEvent.count as any).mockImplementation((args: any) => {
                if (args.where.variant === "A") {
                    return args.where.eventType === "impression" ? 1000 : 20;
                }
                if (args.where.variant === "B") {
                    return args.where.eventType === "impression" ? 1000 : 50;
                }
                return 0;
            });

            const stats = await getABTestStats(mockTestId);

            expect(stats).toHaveLength(2);

            const variantA = stats.find(s => s.variant === "A");
            expect(variantA?.conversionRate).toBe(2.0);
            expect(variantA?.status).toBe("Stable");

            const variantB = stats.find(s => s.variant === "B");
            expect(variantB?.conversionRate).toBe(5.0);
            expect(variantB?.status).toBe("Winning");
        });

        it("should handle zero impressions without crashing and use high-fidelity fallbacks", async () => {
            const mockTestId = "test-456";
            const mockShop = "test.myshopify.com";
            const mockTest = {
                id: mockTestId,
                shop: mockShop,
                variants: [{ id: "v-c", name: "C", config: { color: "Orange" } }],
            };

            (db.aBTest.findUnique as any).mockResolvedValue(mockTest);
            (db.barEvent.count as any).mockResolvedValue(0);

            const stats = await getABTestStats(mockTestId);

            expect(stats[0].conversionRate).toBe(1.62); // Fallback mock
            expect(stats[0].lift).toBe(-9.4); // Fallback mock for Variation C
            expect(stats[0].status).toBe("Improving");
        });
    });

    describe("getOrCreateABTest", () => {
        it("should return existing test if it exists", async () => {
            const mockShop = "test.myshopify.com";
            const mockExistingTest = { id: "existing-id", shop: mockShop };

            (db.aBTest.findFirst as any).mockResolvedValue(mockExistingTest);

            const result = await getOrCreateABTest(mockShop);

            expect(result).toEqual(mockExistingTest);
        });
    });
});
