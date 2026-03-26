import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import {
  checkAndTransitionTests,
  createExperiment,
  resetTransitionThrottle,
} from "../models/analytics.server";

const mockDb = db as any;
const SHOP = "test-shop.myshopify.com";

describe("checkAndTransitionTests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransitionThrottle();
    // Mock $transaction to execute the callback with the mock db
    mockDb.$transaction.mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockDb));
  });

  it("auto-completes active tests past their endAt", async () => {
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 1 });
    mockDb.aBTest.findFirst.mockResolvedValue(null);

    await checkAndTransitionTests(SHOP);

    expect(mockDb.$transaction).toHaveBeenCalled();
    expect(mockDb.aBTest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shop: SHOP,
          status: "active",
          endAt: expect.objectContaining({ not: null, lte: expect.any(Date) }),
        }),
        data: expect.objectContaining({
          status: "completed",
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("auto-activates scheduled tests that reached their startAt", async () => {
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
    // No active test after completion check
    mockDb.aBTest.findFirst
      .mockResolvedValueOnce(null) // check for active test
      .mockResolvedValueOnce({ id: "scheduled-test", status: "scheduled" }); // find scheduled test

    mockDb.aBTest.update.mockResolvedValue({ id: "scheduled-test", status: "active" });

    await checkAndTransitionTests(SHOP);

    expect(mockDb.aBTest.update).toHaveBeenCalledWith({
      where: { id: "scheduled-test" },
      data: { status: "active" },
    });
  });

  it("does not activate scheduled test if another test is already active", async () => {
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
    // An active test exists
    mockDb.aBTest.findFirst.mockResolvedValueOnce({ id: "active-test", status: "active" });

    await checkAndTransitionTests(SHOP);

    // Should only call findFirst once (for active check), not a second time for scheduled
    expect(mockDb.aBTest.update).not.toHaveBeenCalled();
  });

  it("skips transition check within throttle window", async () => {
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
    mockDb.aBTest.findFirst.mockResolvedValue(null);

    await checkAndTransitionTests(SHOP);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);

    // Second call within throttle window should be skipped
    await checkAndTransitionTests(SHOP);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it("runs transition check after throttle reset", async () => {
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
    mockDb.aBTest.findFirst.mockResolvedValue(null);

    await checkAndTransitionTests(SHOP);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);

    resetTransitionThrottle(SHOP);

    await checkAndTransitionTests(SHOP);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe("createExperiment with scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransitionThrottle();
    mockDb.$transaction.mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockDb));
  });

  it("creates a scheduled experiment when startAt is in the future", async () => {
    const futureDate = new Date(Date.now() + 86400000); // tomorrow
    // checkAndTransitionTests mocks
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
    mockDb.aBTest.findFirst.mockResolvedValue(null);

    const mockCreated = {
      id: "new-test",
      shop: SHOP,
      name: "Scheduled Test",
      status: "scheduled",
      startAt: futureDate,
      variants: [],
    };
    mockDb.aBTest.create.mockResolvedValue(mockCreated);

    const result = await createExperiment(SHOP, {
      name: "Scheduled Test",
      startAt: futureDate,
      variants: [{ name: "A", config: { color: "#000" } }],
    });

    expect(result.status).toBe("scheduled");
    expect(mockDb.aBTest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "scheduled",
          startAt: futureDate,
        }),
      }),
    );
  });

  it("creates an active experiment when no startAt is provided", async () => {
    // checkAndTransitionTests mocks
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
    mockDb.aBTest.findFirst.mockResolvedValue(null);

    const mockCreated = {
      id: "new-test",
      shop: SHOP,
      name: "Immediate Test",
      status: "active",
      variants: [],
    };
    mockDb.aBTest.create.mockResolvedValue(mockCreated);

    const result = await createExperiment(SHOP, {
      name: "Immediate Test",
      variants: [{ name: "A", config: { color: "#000" } }],
    });

    expect(result.status).toBe("active");
    expect(mockDb.aBTest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "active",
        }),
      }),
    );
  });

  it("creates an active experiment with endAt for auto-completion", async () => {
    const endDate = new Date(Date.now() + 86400000 * 7); // 7 days from now
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
    mockDb.aBTest.findFirst.mockResolvedValue(null);

    const mockCreated = {
      id: "new-test",
      shop: SHOP,
      name: "Timed Test",
      status: "active",
      endAt: endDate,
      variants: [],
    };
    mockDb.aBTest.create.mockResolvedValue(mockCreated);

    await createExperiment(SHOP, {
      name: "Timed Test",
      endAt: endDate,
      variants: [{ name: "A", config: { color: "#000" } }],
    });

    expect(mockDb.aBTest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endAt: endDate,
        }),
      }),
    );
  });
});
