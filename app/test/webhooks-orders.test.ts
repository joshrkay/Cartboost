import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { action } from "../routes/webhooks.orders.create";

vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

const mockDb = db as any;
const mockAuthenticate = authenticate as unknown as { webhook: ReturnType<typeof vi.fn> };

function makeRequest() {
  return new Request("http://test/webhooks/orders/create", { method: "POST" });
}

describe("webhooks.orders.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates order_completed event with correct revenue", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      payload: {
        id: 12345,
        total_price: "99.50",
        currency: "USD",
        note_attributes: [
          { name: "_cartboost_variant", value: "variant-id-abc" },
          { name: "_cartboost_vid", value: "visitor-123" },
        ],
      },
    });

    mockDb.aBVariant.findUnique.mockResolvedValue({
      id: "variant-id-abc",
      test: { shop: "test-shop.myshopify.com" },
    });
    mockDb.barEvent.create.mockResolvedValue({ id: "event-1" });

    const response = await action({
      request: makeRequest(),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(200);
    expect(mockDb.barEvent.create).toHaveBeenCalledWith({
      data: {
        variantId: "variant-id-abc",
        eventType: "order_completed",
        revenue: 99.5,
        currency: "USD",
      },
    });
  });

  it("skips silently when no cart attributes present", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      payload: {
        id: 12345,
        total_price: "50.00",
        currency: "USD",
        note_attributes: [],
      },
    });

    const response = await action({
      request: makeRequest(),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(200);
    expect(mockDb.barEvent.create).not.toHaveBeenCalled();
  });

  it("skips when variant does not belong to the shop", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      payload: {
        id: 12345,
        total_price: "50.00",
        currency: "USD",
        note_attributes: [{ name: "_cartboost_variant", value: "variant-id-abc" }],
      },
    });

    mockDb.aBVariant.findUnique.mockResolvedValue({
      id: "variant-id-abc",
      test: { shop: "other-shop.myshopify.com" },
    });

    const response = await action({
      request: makeRequest(),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(200);
    expect(mockDb.barEvent.create).not.toHaveBeenCalled();
  });

  it("skips when variant not found", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      payload: {
        id: 12345,
        total_price: "50.00",
        currency: "USD",
        note_attributes: [{ name: "_cartboost_variant", value: "nonexistent" }],
      },
    });

    mockDb.aBVariant.findUnique.mockResolvedValue(null);

    const response = await action({
      request: makeRequest(),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(200);
    expect(mockDb.barEvent.create).not.toHaveBeenCalled();
  });

  it("skips when revenue is zero or negative", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      payload: {
        id: 12345,
        total_price: "0.00",
        currency: "USD",
        note_attributes: [{ name: "_cartboost_variant", value: "variant-id-abc" }],
      },
    });

    mockDb.aBVariant.findUnique.mockResolvedValue({
      id: "variant-id-abc",
      test: { shop: "test-shop.myshopify.com" },
    });

    const response = await action({
      request: makeRequest(),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(200);
    expect(mockDb.barEvent.create).not.toHaveBeenCalled();
  });

  it("handles missing note_attributes field gracefully", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      payload: {
        id: 12345,
        total_price: "50.00",
        currency: "USD",
      },
    });

    const response = await action({
      request: makeRequest(),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(200);
    expect(mockDb.barEvent.create).not.toHaveBeenCalled();
  });
});
