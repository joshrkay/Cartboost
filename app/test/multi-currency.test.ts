import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import {
  createExperiment,
  updateExperiment,
  resetTransitionThrottle,
} from "../models/analytics.server";

const mockDb = db as any;
const SHOP = "test-shop.myshopify.com";

describe("Multi-Currency Thresholds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransitionThrottle();
    mockDb.$transaction.mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockDb));
  });

  describe("createExperiment with currencyThresholds", () => {
    it("creates experiment with currency thresholds", async () => {
      // checkAndTransitionTests mocks
      mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
      mockDb.aBTest.findFirst.mockResolvedValue(null);

      const thresholds = { USD: 50, EUR: 45, GBP: 40 };
      const mockCreated = {
        id: "new-test",
        shop: SHOP,
        name: "Multi-Currency Test",
        status: "active",
        currencyThresholds: thresholds,
        variants: [],
      };
      mockDb.aBTest.create.mockResolvedValue(mockCreated);

      const result = await createExperiment(SHOP, {
        name: "Multi-Currency Test",
        currencyThresholds: thresholds,
        variants: [{ name: "A", config: { color: "#000" } }],
      });

      expect(result.currencyThresholds).toEqual(thresholds);
      expect(mockDb.aBTest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currencyThresholds: thresholds,
          }),
        }),
      );
    });

    it("creates experiment without currency thresholds (null)", async () => {
      mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
      mockDb.aBTest.findFirst.mockResolvedValue(null);

      const mockCreated = {
        id: "new-test",
        shop: SHOP,
        name: "Basic Test",
        status: "active",
        currencyThresholds: null,
        variants: [],
      };
      mockDb.aBTest.create.mockResolvedValue(mockCreated);

      await createExperiment(SHOP, {
        name: "Basic Test",
        variants: [{ name: "A", config: { color: "#000" } }],
      });

      // Should not include currencyThresholds in data
      const createCall = mockDb.aBTest.create.mock.calls[0][0];
      expect(createCall.data.currencyThresholds).toBeUndefined();
    });
  });

  describe("updateExperiment with currencyThresholds", () => {
    it("updates currency thresholds", async () => {
      const thresholds = { USD: 60, EUR: 55 };
      mockDb.aBTest.update.mockResolvedValue({
        id: "test-1",
        currencyThresholds: thresholds,
        variants: [],
      });

      await updateExperiment("test-1", {
        currencyThresholds: thresholds,
      });

      expect(mockDb.aBTest.update).toHaveBeenCalledWith({
        where: { id: "test-1" },
        data: { currencyThresholds: thresholds },
        include: { variants: true },
      });
    });

    it("clears currency thresholds by setting to null (uses Prisma.DbNull)", async () => {
      mockDb.aBTest.update.mockResolvedValue({
        id: "test-1",
        currencyThresholds: null,
        variants: [],
      });

      await updateExperiment("test-1", {
        currencyThresholds: null,
      });

      // Prisma requires DbNull for nullable JSON fields
      const updateCall = mockDb.aBTest.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: "test-1" });
      expect(updateCall.include).toEqual({ variants: true });
      // Verify it's not plain null (Prisma uses a special DbNull object)
      expect(updateCall.data.currencyThresholds).not.toBeNull();
      expect(updateCall.data.currencyThresholds).toBeDefined();
    });
  });

  describe("selectThresholdForCurrency (core.js)", () => {
    // These are already tested in cartboost-core.test.js
    // but we add a few integration-style checks

    // Import the core module
    let core: any;
    beforeEach(async () => {
      Object.defineProperty(globalThis, "document", {
        value: { cookie: "" },
        writable: true,
        configurable: true,
      });
      // Re-import to ensure fresh state
      // @ts-expect-error - cartboost-core.js is a plain script, not a module
      await import("../../extensions/free-shipping-bar/assets/cartboost-core.js");
      core = (globalThis as any).__cartboostCore;
    });

    it("selects correct threshold for matching currency", () => {
      const thresholds = { USD: 50, EUR: 45, GBP: 40 };
      expect(core.selectThresholdForCurrency(thresholds, "EUR", 50)).toBe(45);
    });

    it("falls back to default for unknown currency", () => {
      const thresholds = { USD: 50, EUR: 45 };
      expect(core.selectThresholdForCurrency(thresholds, "JPY", 50)).toBe(50);
    });

    it("falls back to default when thresholds are null", () => {
      expect(core.selectThresholdForCurrency(null, "USD", 50)).toBe(50);
    });

    it("falls back to default when currency is null", () => {
      const thresholds = { USD: 50 };
      expect(core.selectThresholdForCurrency(thresholds, null, 50)).toBe(50);
    });
  });
});
