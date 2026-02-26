import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeDateRange, getDateRangeLabel } from "../models/analytics.server";

describe("getDateRangeLabel", () => {
  it("returns correct labels for known keys", () => {
    expect(getDateRangeLabel("last7")).toBe("Last 7 days");
    expect(getDateRangeLabel("thisWeek")).toBe("This week");
    expect(getDateRangeLabel("thisMonth")).toBe("This month");
    expect(getDateRangeLabel("last30")).toBe("Last 30 days");
  });

  it("falls back to 'Last 7 days' for unknown keys", () => {
    expect(getDateRangeLabel("invalid")).toBe("Last 7 days");
    expect(getDateRangeLabel("")).toBe("Last 7 days");
  });
});

describe("computeDateRange", () => {
  beforeEach(() => {
    // Wednesday, Jan 15, 2026, 14:30:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T14:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("last7: returns a range from 7 days ago at midnight to now", () => {
    const { from, to } = computeDateRange("last7");
    expect(from.getDate()).toBe(8);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getTime()).toBe(new Date("2026-01-15T14:30:00Z").getTime());
  });

  it("last30: returns a range from 30 days ago at midnight to now", () => {
    const { from, to } = computeDateRange("last30");
    expect(from.getDate()).toBe(16); // Dec 16
    expect(from.getMonth()).toBe(11); // December (0-indexed)
    expect(from.getHours()).toBe(0);
    expect(to).toBeDefined();
  });

  it("thisMonth: returns from the 1st of current month to now", () => {
    const { from } = computeDateRange("thisMonth");
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(0); // January
    expect(from.getFullYear()).toBe(2026);
  });

  it("thisWeek: returns from Sunday of current week to now", () => {
    const { from } = computeDateRange("thisWeek");
    // Jan 15 2026 is a Thursday, so Sunday is Jan 11
    expect(from.getDay()).toBe(0); // Sunday
    expect(from.getHours()).toBe(0);
    expect(from.getDate()).toBe(11);
  });

  it("defaults to last7 for unknown keys", () => {
    const unknown = computeDateRange("foobar");
    const last7 = computeDateRange("last7");
    expect(unknown.from.getTime()).toBe(last7.from.getTime());
  });
});
