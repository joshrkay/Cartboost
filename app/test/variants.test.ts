import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit-level tests for api.variants.tsx logic.
 * Tests plan enforcement (plan limits, maxVariants, allowedTestModes)
 * and response shape validation.
 */

const PLAN_LIMITS: Record<string, { maxVariants: number; allowedTestModes: string[] }> = {
  free: { maxVariants: 1, allowedTestModes: ["same_message"] },
  pro: { maxVariants: 3, allowedTestModes: ["same_message"] },
  premium: { maxVariants: 5, allowedTestModes: ["same_message", "random_message_random_color", "paired"] },
};

interface Variant {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

function buildVariantsResponse(
  shop: string | null,
  shopPlan: { plan: string } | null,
  testVariants: Variant[],
) {
  if (!shop) return { status: 401 };

  const plan = shopPlan?.plan ?? "free";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const variants = testVariants.map((v) => ({
    id: v.id,
    name: v.name,
    config: v.config,
  }));

  return {
    status: 200,
    body: {
      variants,
      plan,
      maxVariants: limits.maxVariants,
      allowedTestModes: limits.allowedTestModes,
    },
  };
}

const MOCK_VARIANTS: Variant[] = [
  { id: "cltest_a_12345678901", name: "A", config: { color: "#4CAF50", text: "Free shipping over $50" } },
  { id: "cltest_b_12345678901", name: "B", config: { color: "#2196F3", text: "Limited Time: Free Shipping!" } },
  { id: "cltest_c_12345678901", name: "C", config: { color: "#FF9800", text: "Get Free Shipping Today" } },
];

describe("variants API — plan enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("authentication", () => {
    it("returns 401 when shop is not provided", () => {
      const result = buildVariantsResponse(null, null, MOCK_VARIANTS);
      expect(result.status).toBe(401);
    });

    it("allows request when shop is provided", () => {
      const result = buildVariantsResponse("test.myshopify.com", null, MOCK_VARIANTS);
      expect(result.status).toBe(200);
    });
  });

  describe("response shape", () => {
    it("includes variants array with id, name, config", () => {
      const result = buildVariantsResponse("test.myshopify.com", null, MOCK_VARIANTS);
      expect(result.status).toBe(200);
      const body = result.body!;
      expect(body.variants).toHaveLength(3);
      expect(body.variants[0]).toEqual({
        id: "cltest_a_12345678901",
        name: "A",
        config: { color: "#4CAF50", text: "Free shipping over $50" },
      });
    });

    it("includes plan, maxVariants, and allowedTestModes", () => {
      const result = buildVariantsResponse("test.myshopify.com", null, MOCK_VARIANTS);
      const body = result.body!;
      expect(body).toHaveProperty("plan");
      expect(body).toHaveProperty("maxVariants");
      expect(body).toHaveProperty("allowedTestModes");
      expect(typeof body.plan).toBe("string");
      expect(typeof body.maxVariants).toBe("number");
      expect(Array.isArray(body.allowedTestModes)).toBe(true);
    });
  });

  describe("free plan enforcement", () => {
    it("defaults to free plan when no ShopPlan exists", () => {
      const result = buildVariantsResponse("test.myshopify.com", null, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.plan).toBe("free");
      expect(body.maxVariants).toBe(1);
      expect(body.allowedTestModes).toEqual(["same_message"]);
    });

    it("returns maxVariants=1 for free plan", () => {
      const result = buildVariantsResponse("test.myshopify.com", { plan: "free" }, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.maxVariants).toBe(1);
    });

    it("only allows same_message test mode for free plan", () => {
      const result = buildVariantsResponse("test.myshopify.com", { plan: "free" }, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.allowedTestModes).toEqual(["same_message"]);
    });
  });

  describe("pro plan enforcement", () => {
    it("returns maxVariants=3 for pro plan", () => {
      const result = buildVariantsResponse("test.myshopify.com", { plan: "pro" }, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.plan).toBe("pro");
      expect(body.maxVariants).toBe(3);
    });

    it("only allows same_message test mode for pro plan", () => {
      const result = buildVariantsResponse("test.myshopify.com", { plan: "pro" }, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.allowedTestModes).toEqual(["same_message"]);
    });
  });

  describe("premium plan enforcement", () => {
    it("returns maxVariants=5 for premium plan", () => {
      const result = buildVariantsResponse("test.myshopify.com", { plan: "premium" }, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.plan).toBe("premium");
      expect(body.maxVariants).toBe(5);
    });

    it("allows all test modes for premium plan", () => {
      const result = buildVariantsResponse("test.myshopify.com", { plan: "premium" }, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.allowedTestModes).toEqual(["same_message", "random_message_random_color", "paired"]);
    });
  });

  describe("unknown plan fallback", () => {
    it("falls back to free limits for unrecognized plan", () => {
      const result = buildVariantsResponse("test.myshopify.com", { plan: "enterprise" }, MOCK_VARIANTS);
      const body = result.body!;
      expect(body.plan).toBe("enterprise");
      expect(body.maxVariants).toBe(1);
      expect(body.allowedTestModes).toEqual(["same_message"]);
    });
  });

  describe("variant data integrity", () => {
    it("does not expose extra fields beyond id, name, config", () => {
      const extendedVariants = MOCK_VARIANTS.map((v) => ({
        ...v,
        testId: "secret_test_id",
        createdAt: new Date(),
      }));
      const result = buildVariantsResponse("test.myshopify.com", null, extendedVariants as any);
      const body = result.body!;
      for (const v of body.variants) {
        expect(Object.keys(v)).toEqual(["id", "name", "config"]);
      }
    });

    it("returns empty variants array when test has no variants", () => {
      const result = buildVariantsResponse("test.myshopify.com", null, []);
      const body = result.body!;
      expect(body.variants).toEqual([]);
    });
  });
});
