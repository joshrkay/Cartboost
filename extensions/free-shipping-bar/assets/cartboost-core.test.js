import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock document.cookie before importing cartboost-core.js
const mockCookie = { value: "" };
vi.stubGlobal("document", {
  get cookie() { return mockCookie.value; },
  set cookie(v) { mockCookie.value = v; },
});

// Import the module (side-effect: populates globalThis.__cartboostCore)
await import("./cartboost-core.js");

const {
  getOrAssignVariant,
  getOrCreateVisitorId,
  computeBarMessage,
  selectVariantConfig,
  shouldDeduplicateEvent,
  computeProgressPercent,
  selectThresholdForCurrency,
} = globalThis.__cartboostCore;

describe("getOrAssignVariant", () => {
  it("returns existing variant from cookie when valid", () => {
    const result = getOrAssignVariant(3, "1");
    expect(result).toEqual({ index: 1, isNew: false });
  });

  it("returns existing variant index 0 from cookie", () => {
    const result = getOrAssignVariant(3, "0");
    expect(result).toEqual({ index: 0, isNew: false });
  });

  it("rejects cookie value >= numVariants and assigns new", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const result = getOrAssignVariant(3, "5");
    expect(result.isNew).toBe(true);
    expect(result.index).toBe(0);
    vi.restoreAllMocks();
  });

  it("rejects negative cookie value", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const result = getOrAssignVariant(3, "-1");
    expect(result.isNew).toBe(true);
    vi.restoreAllMocks();
  });

  it("rejects non-numeric cookie value", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const result = getOrAssignVariant(2, "abc");
    expect(result.isNew).toBe(true);
    vi.restoreAllMocks();
  });

  it("assigns new variant when cookie is null", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = getOrAssignVariant(3, null);
    expect(result.isNew).toBe(true);
    expect(result.index).toBe(2);
    vi.restoreAllMocks();
  });

  it("assigns new variant when cookie is undefined", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const result = getOrAssignVariant(2, undefined);
    expect(result.isNew).toBe(true);
    expect(result.index).toBe(0);
    vi.restoreAllMocks();
  });

  it("produces valid index for various random values", () => {
    const values = [0.0, 0.25, 0.5, 0.75, 0.999];
    for (const v of values) {
      vi.spyOn(Math, "random").mockReturnValue(v);
      const result = getOrAssignVariant(5, null);
      expect(result.index).toBeGreaterThanOrEqual(0);
      expect(result.index).toBeLessThan(5);
      vi.restoreAllMocks();
    }
  });
});

describe("getOrCreateVisitorId", () => {
  it("returns existing ID when valid (>= 20 chars)", () => {
    const id = "abcdefghij1234567890";
    const result = getOrCreateVisitorId(id);
    expect(result).toEqual({ id, isNew: false });
  });

  it("generates new ID when existing is null", () => {
    const result = getOrCreateVisitorId(null);
    expect(result.isNew).toBe(true);
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("generates new ID when existing is too short", () => {
    const result = getOrCreateVisitorId("short");
    expect(result.isNew).toBe(true);
    expect(result.id.length).toBe(36);
  });

  it("generates new ID when existing is empty string", () => {
    const result = getOrCreateVisitorId("");
    expect(result.isNew).toBe(true);
  });

  it("generates unique IDs on successive calls", () => {
    const a = getOrCreateVisitorId(null);
    const b = getOrCreateVisitorId(null);
    expect(a.id).not.toBe(b.id);
  });
});

describe("computeBarMessage", () => {
  it("returns unlocked message when subtotal >= threshold", () => {
    expect(computeBarMessage(50, 50, "Add X more", "Free shipping!"))
      .toBe("Free shipping!");
  });

  it("returns unlocked message when subtotal > threshold", () => {
    expect(computeBarMessage(75, 50, "Add X more", "Free shipping!"))
      .toBe("Free shipping!");
  });

  it("replaces X with remaining amount when below threshold", () => {
    expect(computeBarMessage(30, 50, "Add X more for free shipping!", "Done!"))
      .toBe("Add 20.00 more for free shipping!");
  });

  it("handles zero cart subtotal", () => {
    expect(computeBarMessage(0, 50, "Add X more", "Done!"))
      .toBe("Add 50.00 more");
  });

  it("formats remaining to two decimal places", () => {
    expect(computeBarMessage(33.33, 50, "Only $X away!", "Done!"))
      .toBe("Only $16.67 away!");
  });

  it("handles exact threshold", () => {
    expect(computeBarMessage(50.00, 50, "Add X more", "Unlocked!"))
      .toBe("Unlocked!");
  });
});

describe("selectVariantConfig", () => {
  const variants = {
    colors: ["#111", "#222", "#333"],
    belowMessages: ["msg-a", "msg-b", "msg-c"],
    unlockedMessages: ["unlock-a", "unlock-b", "unlock-c"],
  };

  it("returns defaults for free tier", () => {
    const result = selectVariantConfig("free", "same_message", variants, 0, "#000", "default below", "default unlocked");
    expect(result).toEqual({
      bgColor: "#000",
      belowMessage: "default below",
      unlockedMessage: "default unlocked",
    });
  });

  it("uses color from variant index for same_message mode", () => {
    const result = selectVariantConfig("pro", "same_message", variants, 1, "#000", "default below", "default unlocked");
    expect(result.bgColor).toBe("#222");
    expect(result.belowMessage).toBe("default below");
    expect(result.unlockedMessage).toBe("default unlocked");
  });

  it("uses paired color and messages for paired mode", () => {
    const result = selectVariantConfig("premium", "paired", variants, 2, "#000", "default below", "default unlocked");
    expect(result.bgColor).toBe("#333");
    expect(result.belowMessage).toBe("msg-c");
    expect(result.unlockedMessage).toBe("unlock-c");
  });

  it("uses random selection for random_message_random_color mode", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const result = selectVariantConfig("premium", "random_message_random_color", variants, 1, "#000", "default below", "default unlocked");
    expect(result.bgColor).toBe("#111");
    expect(result.belowMessage).toBe("msg-a");
    expect(result.unlockedMessage).toBe("unlock-a");
    vi.restoreAllMocks();
  });

  it("falls back to defaults when variant arrays are empty", () => {
    const emptyVariants = { colors: [], belowMessages: [], unlockedMessages: [] };
    const result = selectVariantConfig("pro", "same_message", emptyVariants, 0, "#000", "default below", "default unlocked");
    expect(result.bgColor).toBe("#000");
  });
});

describe("shouldDeduplicateEvent", () => {
  let sentEvents;

  beforeEach(() => {
    sentEvents = {};
  });

  it("returns false (do not skip) for first event", () => {
    expect(shouldDeduplicateEvent("impression", "v-1", sentEvents)).toBe(false);
  });

  it("returns true (skip) for duplicate event", () => {
    shouldDeduplicateEvent("impression", "v-1", sentEvents);
    expect(shouldDeduplicateEvent("impression", "v-1", sentEvents)).toBe(true);
  });

  it("allows same event type for different variants", () => {
    shouldDeduplicateEvent("impression", "v-1", sentEvents);
    expect(shouldDeduplicateEvent("impression", "v-2", sentEvents)).toBe(false);
  });

  it("allows different event types for same variant", () => {
    shouldDeduplicateEvent("impression", "v-1", sentEvents);
    expect(shouldDeduplicateEvent("add_to_cart", "v-1", sentEvents)).toBe(false);
  });
});

describe("computeProgressPercent", () => {
  it("returns 0 for zero subtotal", () => {
    expect(computeProgressPercent(0, 50)).toBe(0);
  });

  it("returns 100 when subtotal meets threshold", () => {
    expect(computeProgressPercent(50, 50)).toBe(100);
  });

  it("returns 100 when subtotal exceeds threshold", () => {
    expect(computeProgressPercent(75, 50)).toBe(100);
  });

  it("returns 50 for half of threshold", () => {
    expect(computeProgressPercent(25, 50)).toBe(50);
  });

  it("rounds to nearest integer", () => {
    expect(computeProgressPercent(33, 100)).toBe(33);
  });

  it("returns 100 when threshold is 0", () => {
    expect(computeProgressPercent(10, 0)).toBe(100);
  });

  it("returns 0 for negative subtotal", () => {
    expect(computeProgressPercent(-5, 50)).toBe(0);
  });
});

describe("selectThresholdForCurrency", () => {
  const thresholds = { USD: 50, EUR: 45, GBP: 40 };

  it("returns threshold for matching currency", () => {
    expect(selectThresholdForCurrency(thresholds, "EUR", 50)).toBe(45);
  });

  it("returns default when currency not in map", () => {
    expect(selectThresholdForCurrency(thresholds, "JPY", 50)).toBe(50);
  });

  it("returns default when thresholds is null", () => {
    expect(selectThresholdForCurrency(null, "USD", 50)).toBe(50);
  });

  it("returns default when activeCurrency is empty", () => {
    expect(selectThresholdForCurrency(thresholds, "", 50)).toBe(50);
  });

  it("returns default when activeCurrency is null", () => {
    expect(selectThresholdForCurrency(thresholds, null, 50)).toBe(50);
  });

  it("returns default when threshold value is 0", () => {
    expect(selectThresholdForCurrency({ USD: 0 }, "USD", 50)).toBe(50);
  });

  it("returns default when threshold value is negative", () => {
    expect(selectThresholdForCurrency({ USD: -10 }, "USD", 50)).toBe(50);
  });
});
