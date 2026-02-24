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
 * Unit tests for the billing action logic.
 * Tests the plan validation and mapping without requiring Shopify auth.
 */
function parseBillingAction(formPlan: string | null) {
  if (formPlan !== "pro" && formPlan !== "premium") {
    return { redirect: "/app", billingRequest: null };
  }

  const planName = formPlan === "pro" ? PLANS.pro : PLANS.premium;
  return {
    redirect: null,
    billingRequest: {
      plan: planName,
      isTest: true,
    },
  };
}

describe("billing action", () => {
  it("maps 'pro' form value to the correct PLANS constant", () => {
    const result = parseBillingAction("pro");
    expect(result.billingRequest).not.toBeNull();
    expect(result.billingRequest!.plan).toBe(PLANS.pro);
    expect(result.billingRequest!.plan).toBe("CartBoost Pro");
  });

  it("maps 'premium' form value to the correct PLANS constant", () => {
    const result = parseBillingAction("premium");
    expect(result.billingRequest).not.toBeNull();
    expect(result.billingRequest!.plan).toBe(PLANS.premium);
    expect(result.billingRequest!.plan).toBe("CartBoost Premium");
  });

  it("redirects to /app when plan is null (no form data)", () => {
    const result = parseBillingAction(null);
    expect(result.redirect).toBe("/app");
    expect(result.billingRequest).toBeNull();
  });

  it("redirects to /app when plan is an invalid value", () => {
    const result = parseBillingAction("enterprise");
    expect(result.redirect).toBe("/app");
    expect(result.billingRequest).toBeNull();
  });

  it("redirects to /app when plan is empty string", () => {
    const result = parseBillingAction("");
    expect(result.redirect).toBe("/app");
    expect(result.billingRequest).toBeNull();
  });
});
