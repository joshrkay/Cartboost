import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import {
  getActiveTest,
  createExperiment,
  updateExperiment,
  updateVariantConfig,
  changeTestStatus,
  deleteExperiment,
  updateTestMode,
  resetTransitionThrottle,
} from "../models/analytics.server";

const mockDb = db as any;

const MOCK_ACTIVE_TEST = {
  id: "test-active",
  shop: "test-shop.myshopify.com",
  name: "Active Test",
  status: "active",
  mode: "manual",
  variants: [
    { id: "v-a", name: "A", config: { color: "#4CAF50" } },
  ],
};

describe("getActiveTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransitionThrottle();
    mockDb.$transaction.mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockDb));
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
  });

  it("returns the active test for a shop", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(MOCK_ACTIVE_TEST);
    const result = await getActiveTest("test-shop.myshopify.com");
    expect(result).toEqual(MOCK_ACTIVE_TEST);
    expect(mockDb.aBTest.findFirst).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com", status: "active" },
      include: { variants: true },
    });
  });

  it("returns null when no active test exists", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(null);
    const result = await getActiveTest("test-shop.myshopify.com");
    expect(result).toBeNull();
  });
});

describe("createExperiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransitionThrottle();
    mockDb.$transaction.mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockDb));
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
  });

  it("creates experiment when no active test exists", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(null);
    mockDb.aBTest.create.mockResolvedValue({
      id: "new-test",
      name: "My Test",
      variants: [{ id: "v1", name: "A" }],
    });

    const result = await createExperiment("test-shop.myshopify.com", {
      name: "My Test",
      variants: [{ name: "A", config: { color: "#000" } }],
    });

    expect(result.name).toBe("My Test");
    expect(mockDb.aBTest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shop: "test-shop.myshopify.com",
          name: "My Test",
        }),
      }),
    );
  });

  it("throws when an active test already exists", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(MOCK_ACTIVE_TEST);

    await expect(
      createExperiment("test-shop.myshopify.com", {
        name: "Another Test",
        variants: [{ name: "A", config: {} }],
      }),
    ).rejects.toThrow("An active experiment already exists");
  });
});

describe("updateExperiment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates test name and description", async () => {
    mockDb.aBTest.update.mockResolvedValue({
      id: "test-1",
      name: "Updated",
      description: "New desc",
    });

    await updateExperiment("test-1", { name: "Updated", description: "New desc" });

    expect(mockDb.aBTest.update).toHaveBeenCalledWith({
      where: { id: "test-1" },
      data: { name: "Updated", description: "New desc" },
      include: { variants: true },
    });
  });
});

describe("updateVariantConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates variant config", async () => {
    mockDb.aBVariant.update.mockResolvedValue({ id: "v1" });

    await updateVariantConfig("v1", { color: "#FF0000", text: "New message" });

    expect(mockDb.aBVariant.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { config: { color: "#FF0000", text: "New message" } },
    });
  });
});

describe("changeTestStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTransitionThrottle();
    mockDb.$transaction.mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockDb));
    mockDb.aBTest.updateMany.mockResolvedValue({ count: 0 });
  });

  it("activates a paused test when no other test is active", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue(null);
    mockDb.aBTest.update.mockResolvedValue({ id: "test-1", status: "active" });

    await changeTestStatus("test-1", "active", "shop.myshopify.com");

    expect(mockDb.aBTest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "test-1" },
        data: { status: "active" },
      }),
    );
  });

  it("throws when activating and another test is already active", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue({ id: "other-test", status: "active" });

    await expect(
      changeTestStatus("test-1", "active", "shop.myshopify.com"),
    ).rejects.toThrow("Another experiment is already active");
  });

  it("sets completedAt when completing a test", async () => {
    mockDb.aBTest.update.mockResolvedValue({ id: "test-1", status: "completed" });

    await changeTestStatus("test-1", "completed", "shop.myshopify.com");

    expect(mockDb.aBTest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("pauses a test without setting completedAt", async () => {
    mockDb.aBTest.update.mockResolvedValue({ id: "test-1", status: "paused" });

    await changeTestStatus("test-1", "paused", "shop.myshopify.com");

    expect(mockDb.aBTest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "paused" },
      }),
    );
  });

  it("allows activating the same test that is already active", async () => {
    mockDb.aBTest.findFirst.mockResolvedValue({ id: "test-1", status: "active" });
    mockDb.aBTest.update.mockResolvedValue({ id: "test-1", status: "active" });

    await changeTestStatus("test-1", "active", "shop.myshopify.com");

    expect(mockDb.aBTest.update).toHaveBeenCalled();
  });
});

describe("deleteExperiment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the experiment", async () => {
    mockDb.aBTest.delete.mockResolvedValue({ id: "test-1" });
    await deleteExperiment("test-1");
    expect(mockDb.aBTest.delete).toHaveBeenCalledWith({ where: { id: "test-1" } });
  });
});

describe("updateTestMode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates test mode to auto_optimize", async () => {
    mockDb.aBTest.update.mockResolvedValue({ id: "test-1", mode: "auto_optimize" });
    await updateTestMode("test-1", "auto_optimize");
    expect(mockDb.aBTest.update).toHaveBeenCalledWith({
      where: { id: "test-1" },
      data: { mode: "auto_optimize" },
    });
  });

  it("updates test mode to manual", async () => {
    mockDb.aBTest.update.mockResolvedValue({ id: "test-1", mode: "manual" });
    await updateTestMode("test-1", "manual");
    expect(mockDb.aBTest.update).toHaveBeenCalledWith({
      where: { id: "test-1" },
      data: { mode: "manual" },
    });
  });
});
