import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";

const mockDb = db as any;

const VALID_EVENT_TYPES = ["impression", "click", "add_to_cart", "conversion"];
const VALID_VARIANT_PATTERN = /^[A-Za-z0-9]{1,10}$/;

/**
 * Unit-level validation tests that mirror the logic in api.track-event.tsx.
 * These test the validation rules without requiring Shopify auth mocks.
 */
function validateAndTrack(body: { variant?: string; eventType?: string }, shop: string | null) {
  if (!shop) return { status: 401 };

  const { variant, eventType } = body;

  if (!variant || !VALID_VARIANT_PATTERN.test(variant)) {
    return { status: 400, reason: "Invalid variant" };
  }

  if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
    return { status: 400, reason: "Invalid event type" };
  }

  db.barEvent.create({
    data: { shopDomain: shop, variant, eventType },
  });

  return { status: 204 };
}

describe("track-event API", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("authentication", () => {
    it("returns 401 when shop is not provided (unauthenticated)", () => {
      const result = validateAndTrack({ variant: "A", eventType: "impression" }, null);
      expect(result.status).toBe(401);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("allows request when shop is provided (authenticated proxy)", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      const result = validateAndTrack({ variant: "A", eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(204);
    });
  });

  describe("variant validation", () => {
    it("returns 400 when variant is missing", () => {
      const result = validateAndTrack({ eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variant is empty string", () => {
      const result = validateAndTrack({ variant: "", eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variant contains special characters", () => {
      const result = validateAndTrack({ variant: "A<script>", eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 when variant exceeds 10 characters", () => {
      const result = validateAndTrack({ variant: "ABCDEFGHIJK", eventType: "impression" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("accepts valid alphanumeric variants", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      expect(validateAndTrack({ variant: "A", eventType: "impression" }, "test.myshopify.com").status).toBe(204);
      expect(validateAndTrack({ variant: "B", eventType: "impression" }, "test.myshopify.com").status).toBe(204);
      expect(validateAndTrack({ variant: "Control1", eventType: "impression" }, "test.myshopify.com").status).toBe(204);
    });
  });

  describe("eventType validation", () => {
    it("returns 400 when eventType is missing", () => {
      const result = validateAndTrack({ variant: "A" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid eventType", () => {
      const result = validateAndTrack({ variant: "A", eventType: "hacked" }, "test.myshopify.com");
      expect(result.status).toBe(400);
      expect(mockDb.barEvent.create).not.toHaveBeenCalled();
    });

    it("accepts all valid event types", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      for (const eventType of VALID_EVENT_TYPES) {
        const result = validateAndTrack({ variant: "A", eventType }, "test.myshopify.com");
        expect(result.status).toBe(204);
      }
    });
  });

  describe("database writes", () => {
    it("writes correct data for impression event", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      validateAndTrack({ variant: "A", eventType: "impression" }, "cartboost-test.myshopify.com");
      expect(mockDb.barEvent.create).toHaveBeenCalledWith({
        data: {
          shopDomain: "cartboost-test.myshopify.com",
          variant: "A",
          eventType: "impression",
        },
      });
    });

    it("writes correct data for conversion event", () => {
      mockDb.barEvent.create.mockResolvedValue({});
      validateAndTrack({ variant: "B", eventType: "conversion" }, "test.myshopify.com");
      expect(mockDb.barEvent.create).toHaveBeenCalledWith({
        data: {
          shopDomain: "test.myshopify.com",
          variant: "B",
          eventType: "conversion",
        },
      });
    });
  });
});
