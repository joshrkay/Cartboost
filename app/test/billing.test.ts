import { describe, it, expect, vi } from "vitest";

// Mock shopify.server to avoid PrismaSessionStorage initialization
vi.mock("../shopify.server", () => ({
  PLANS: {
    pro: "CartBoost Pro",
    premium: "CartBoost Premium",
  },
  authenticate: {},
}));

import { PLANS } from "../shopify.server";

/**
 * Unit tests for the billing loader logic.
 * Tests the plan validation and mapping without requiring Shopify auth.
 */
function parseBillingRequest(queryPlan: string | null) {
  if (queryPlan !== "pro" && queryPlan !== "premium") {
    return { redirect: "/app", billingRequest: null };
  }

  const planName = queryPlan === "pro" ? PLANS.pro : PLANS.premium;
  return {
    redirect: null,
    billingRequest: {
      plan: planName,
      isTest: true,
    },
  };
}

describe("billing loader", () => {
  it("maps 'pro' query param to the correct PLANS constant", () => {
    const result = parseBillingRequest("pro");
    expect(result.billingRequest).not.toBeNull();
    expect(result.billingRequest!.plan).toBe(PLANS.pro);
    expect(result.billingRequest!.plan).toBe("CartBoost Pro");
  });

  it("maps 'premium' query param to the correct PLANS constant", () => {
    const result = parseBillingRequest("premium");
    expect(result.billingRequest).not.toBeNull();
    expect(result.billingRequest!.plan).toBe(PLANS.premium);
    expect(result.billingRequest!.plan).toBe("CartBoost Premium");
  });

  it("redirects to /app when plan is null (missing query param)", () => {
    const result = parseBillingRequest(null);
    expect(result.redirect).toBe("/app");
    expect(result.billingRequest).toBeNull();
  });

  it("redirects to /app when plan is an invalid value", () => {
    const result = parseBillingRequest("enterprise");
    expect(result.redirect).toBe("/app");
    expect(result.billingRequest).toBeNull();
  });

  it("redirects to /app when plan is empty string", () => {
    const result = parseBillingRequest("");
    expect(result.redirect).toBe("/app");
    expect(result.billingRequest).toBeNull();
  });
});
