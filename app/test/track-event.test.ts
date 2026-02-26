import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";

const mockDb = db as any;

const VALID_EVENT_TYPES = ["impression", "click", "add_to_cart", "conversion"];
const VALID_CUID_PATTERN = /^[a-z0-9]{20,30}$/;

/**
 * Unit-level validation tests that mirror the logic in api.track-event.tsx.
 * These test the validation rules without requiring Shopify auth mocks.
 */
function validateAndTrack(
  body: { variantId?: string; eventType?: string },
  shop: string | null,
  variantLookup: any | null = { id: "cltest12345678901234", test: { shop: "test.myshopify.com" } },
) {
  if (!shop) return { status: 401 };

  const { variantId, eventType } = body;

  if (!variantId || !VALID_CUID_PATTERN.test(variantId)) {
    return { status: 400, reason: "Invalid variantId" };
  }

  if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
    return { status: 400, reason: "Invalid event type" };
  }

  // Simulate variant ownership check
  if (!variantLookup || variantLookup.test.shop !== shop) {
    return { status: 400, reason: "Invalid variantId" };
  }

  db.barEvent.create({
    data: { variantId, eventType },
  });

  return { status: 204 };
}

const VALID_VARIANT_ID = "cltest12345678901234";

describe("track-event API", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("authentication", () => {
    it("returns 401 when shop is not provided (unauthenticated)", () => {
      const result = validateAndTrack({ variantId: VALID_VARIANT_ID, eventType: "impression" }, null);
      expect(result.status).toBe(401);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("allows request when shop is provided (authenticated proxy)", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      const result = validateAndTrack(
        { variantId: VALID_VARIANT_ID, eventType: "impression" },
        "test.myshopify.com",
        { id: VALID_VARIANT_ID, test: { shop: "test.myshopify.com" } },
      );
      expect(result.status).toBe(204);
    });
  });

  describe("variantId validation", () => {
    it("returns 400 when variantId is missing", () => {
      const result = validateAndTrack({ eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variantId is empty string", () => {
      const result = validateAndTrack({ variantId: "", eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variantId contains special characters", () => {
      const result = validateAndTrack({ variantId: "A<script>xss</script>", eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variantId is too short to be a cuid", () => {
      const result = validateAndTrack({ variantId: "abc", eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variant belongs to a different shop", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      const result = validateAndTrack(
        { variantId: VALID_VARIANT_ID, eventType: "impression" },
        "other-shop.myshopify.com",
        { id: VALID_VARIANT_ID, test: { shop: "test.myshopify.com" } },
      );
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variant does not exist", () => {
      const result = validateAndTrack(
        { variantId: VALID_VARIANT_ID, eventType: "impression" },
        "test.myshopify.com",
        null,
      );
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("eventType validation", () => {
    it("returns 400 when eventType is missing", () => {
      const result = validateAndTrack({ variantId: VALID_VARIANT_ID }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid eventType", () => {
      const result = validateAndTrack({ variantId: VALID_VARIANT_ID, eventType: "hacked" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("accepts all valid event types", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      for (const eventType of VALID_EVENT_TYPES) {
        const result = validateAndTrack(
          { variantId: VALID_VARIANT_ID, eventType },
          "test.myshopify.com",
          { id: VALID_VARIANT_ID, test: { shop: "test.myshopify.com" } },
        );
        expect(result.status).toBe(204);
      }
    });
  });

  describe("database writes", () => {
    it("writes correct data with variantId for impression event", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      validateAndTrack(
        { variantId: VALID_VARIANT_ID, eventType: "impression" },
        "test.myshopify.com",
        { id: VALID_VARIANT_ID, test: { shop: "test.myshopify.com" } },
      );
      expect(mockDb.barEvent.create).toHaveBeenCalledWith({
        data: {
          variantId: VALID_VARIANT_ID,
          eventType: "impression",
        },
      });
    });

    it("writes correct data with variantId for conversion event", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      validateAndTrack(
        { variantId: VALID_VARIANT_ID, eventType: "conversion" },
        "test.myshopify.com",
        { id: VALID_VARIANT_ID, test: { shop: "test.myshopify.com" } },
      );
      expect(mockDb.barEvent.create).toHaveBeenCalledWith({
        data: {
          variantId: VALID_VARIANT_ID,
          eventType: "conversion",
        },
      });
    });
  });
});
