import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock document.cookie before importing cartboost-core
Object.defineProperty(globalThis, "document", {
  value: { cookie: "" },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "window", {
  value: { innerWidth: 1024 },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "" },
  writable: true,
  configurable: true,
});

// Import the core module (plain JS, not a TS module)
// @ts-expect-error - cartboost-core.js is a plain script, not a module
await import("../../extensions/free-shipping-bar/assets/cartboost-core.js");

const core = (globalThis as any).__cartboostCore;

describe("detectDeviceType", () => {
  beforeEach(() => {
    // Reset to desktop defaults
    (globalThis as any).window.innerWidth = 1024;
    (globalThis as any).navigator.userAgent = "";
  });

  it("returns 'desktop' when window.innerWidth >= 768 and no mobile UA", () => {
    (globalThis as any).window.innerWidth = 1024;
    expect(core.detectDeviceType()).toBe("desktop");
  });

  it("returns 'desktop' when window.innerWidth === 768 and no mobile UA", () => {
    (globalThis as any).window.innerWidth = 768;
    expect(core.detectDeviceType()).toBe("desktop");
  });

  it("returns 'mobile' when window.innerWidth < 768 and no mobile UA", () => {
    (globalThis as any).window.innerWidth = 375;
    expect(core.detectDeviceType()).toBe("mobile");
  });

  it("returns 'mobile' for very small screens", () => {
    (globalThis as any).window.innerWidth = 320;
    expect(core.detectDeviceType()).toBe("mobile");
  });

  it("returns 'mobile' for iPhone user agent even with wide viewport", () => {
    (globalThis as any).navigator.userAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15";
    (globalThis as any).window.innerWidth = 1024;
    expect(core.detectDeviceType()).toBe("mobile");
  });

  it("returns 'mobile' for Android user agent even with wide viewport", () => {
    (globalThis as any).navigator.userAgent =
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";
    (globalThis as any).window.innerWidth = 1024;
    expect(core.detectDeviceType()).toBe("mobile");
  });

  it("returns 'desktop' for desktop user agent in narrow window", () => {
    (globalThis as any).navigator.userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36";
    (globalThis as any).window.innerWidth = 500;
    // Desktop UA takes precedence — narrow window should NOT classify as mobile
    expect(core.detectDeviceType()).toBe("desktop");
  });
});

describe("filterVariantsByDevice", () => {
  const variants = [
    { id: "v1", name: "A", config: { deviceTarget: "all" } },
    { id: "v2", name: "B", config: { deviceTarget: "mobile" } },
    { id: "v3", name: "C", config: { deviceTarget: "desktop" } },
    { id: "v4", name: "D", config: {} },
  ];

  it("returns all variants when no deviceTarget filtering (all or missing)", () => {
    const result = core.filterVariantsByDevice(variants, "desktop");
    // Should include v1 (all), v3 (desktop), v4 (no target)
    expect(result).toHaveLength(3);
    expect(result.map((v: any) => v.id)).toEqual(["v1", "v3", "v4"]);
  });

  it("returns mobile variants when device is mobile", () => {
    const result = core.filterVariantsByDevice(variants, "mobile");
    // Should include v1 (all), v2 (mobile), v4 (no target)
    expect(result).toHaveLength(3);
    expect(result.map((v: any) => v.id)).toEqual(["v1", "v2", "v4"]);
  });

  it("returns all variants when deviceType is null", () => {
    const result = core.filterVariantsByDevice(variants, null);
    expect(result).toHaveLength(4);
  });

  it("returns empty array for null variants input", () => {
    const result = core.filterVariantsByDevice(null, "mobile");
    expect(result).toEqual([]);
  });

  it("handles variants where config is null", () => {
    const weirdVariants = [
      { id: "v1", name: "A", config: null },
      { id: "v2", name: "B", config: { deviceTarget: "mobile" } },
    ];
    const result = core.filterVariantsByDevice(weirdVariants, "desktop");
    // v1 has no config, so deviceTarget is undefined → included
    // v2 targets mobile → excluded
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("v1");
  });
});

describe("track-event deviceType", () => {
  it("detectDeviceType always returns a valid device string", () => {
    (globalThis as any).navigator.userAgent = "";
    (globalThis as any).window.innerWidth = 500;
    const type1 = core.detectDeviceType();
    expect(["mobile", "desktop"]).toContain(type1);

    (globalThis as any).window.innerWidth = 1200;
    const type2 = core.detectDeviceType();
    expect(["mobile", "desktop"]).toContain(type2);
  });
});
