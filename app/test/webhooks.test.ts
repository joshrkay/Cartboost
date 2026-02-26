import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { action as shopRedactAction } from "../routes/webhooks.shop.redact";
import { action as uninstalledAction } from "../routes/webhooks.app.uninstalled";

vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

const mockDb = db as any;
const mockAuth = authenticate as unknown as { webhook: ReturnType<typeof vi.fn> };

function makeRequest() {
  return new Request("http://localhost/webhooks/test", { method: "POST" });
}

function callAction(action: any) {
  return action({ request: makeRequest(), context: {}, params: {}, unstable_pattern: "" });
}

describe("webhooks.shop.redact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes all shop data in a transaction and returns 200", async () => {
    mockAuth.webhook.mockResolvedValue({ shop: "test.myshopify.com" });
    mockDb.$transaction.mockResolvedValue([]);

    const response = await callAction(shopRedactAction);

    expect(response.status).toBe(200);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);

    // Verify the transaction receives the correct delete operations
    const transactionArg = mockDb.$transaction.mock.calls[0][0];
    expect(transactionArg).toHaveLength(3);
  });

  it("calls deleteMany with the correct shop for each model", async () => {
    const shop = "my-store.myshopify.com";
    mockAuth.webhook.mockResolvedValue({ shop });

    // Make deleteMany return promises so $transaction gets real values
    mockDb.aBTest.deleteMany.mockResolvedValue({ count: 1 });
    mockDb.shopPlan.deleteMany.mockResolvedValue({ count: 1 });
    mockDb.session.deleteMany.mockResolvedValue({ count: 2 });
    mockDb.$transaction.mockResolvedValue([]);

    await callAction(shopRedactAction);

    expect(mockDb.aBTest.deleteMany).toHaveBeenCalledWith({ where: { shop } });
    expect(mockDb.shopPlan.deleteMany).toHaveBeenCalledWith({ where: { shop } });
    expect(mockDb.session.deleteMany).toHaveBeenCalledWith({ where: { shop } });
  });

  it("returns 500 when transaction fails", async () => {
    mockAuth.webhook.mockResolvedValue({ shop: "fail.myshopify.com" });
    mockDb.$transaction.mockRejectedValue(new Error("connection refused"));

    const response = await callAction(shopRedactAction);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toBe("Internal Server Error");
  });

  it("is idempotent — succeeds even if no data exists", async () => {
    mockAuth.webhook.mockResolvedValue({ shop: "empty.myshopify.com" });
    mockDb.$transaction.mockResolvedValue([
      { count: 0 },
      { count: 0 },
      { count: 0 },
    ]);

    const response = await callAction(shopRedactAction);
    expect(response.status).toBe(200);
  });
});

describe("webhooks.app.uninstalled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes all shop data and returns 200", async () => {
    mockAuth.webhook.mockResolvedValue({ shop: "uninstall.myshopify.com" });
    mockDb.$transaction.mockResolvedValue([]);

    const response = await callAction(uninstalledAction);

    expect(response.status).toBe(200);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it("deletes ABTests, ShopPlan, and Sessions for the shop", async () => {
    const shop = "leaving.myshopify.com";
    mockAuth.webhook.mockResolvedValue({ shop });
    mockDb.aBTest.deleteMany.mockResolvedValue({ count: 2 });
    mockDb.shopPlan.deleteMany.mockResolvedValue({ count: 1 });
    mockDb.session.deleteMany.mockResolvedValue({ count: 3 });
    mockDb.$transaction.mockResolvedValue([]);

    await callAction(uninstalledAction);

    expect(mockDb.aBTest.deleteMany).toHaveBeenCalledWith({ where: { shop } });
    expect(mockDb.shopPlan.deleteMany).toHaveBeenCalledWith({ where: { shop } });
    expect(mockDb.session.deleteMany).toHaveBeenCalledWith({ where: { shop } });
  });

  it("returns 500 when cleanup fails", async () => {
    mockAuth.webhook.mockResolvedValue({ shop: "fail.myshopify.com" });
    mockDb.$transaction.mockRejectedValue(new Error("DB timeout"));

    const response = await callAction(uninstalledAction);

    expect(response.status).toBe(500);
  });

  it("succeeds when shop has no data to delete", async () => {
    mockAuth.webhook.mockResolvedValue({ shop: "new.myshopify.com" });
    mockDb.$transaction.mockResolvedValue([
      { count: 0 },
      { count: 0 },
      { count: 0 },
    ]);

    const response = await callAction(uninstalledAction);
    expect(response.status).toBe(200);
  });
});
