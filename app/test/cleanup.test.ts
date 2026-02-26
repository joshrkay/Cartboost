import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import db from "../db.server";
import { purgeExpiredEvents, purgeExpiredSessions } from "../models/analytics.server";
import { loader } from "../routes/api.cleanup";

const mockDb = db as any;

describe("purgeExpiredEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes events older than 90 days by default", async () => {
    mockDb.barEvent.deleteMany.mockResolvedValue({ count: 150 });

    const deleted = await purgeExpiredEvents();

    expect(deleted).toBe(150);
    expect(mockDb.barEvent.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });

    const cutoffArg = mockDb.barEvent.deleteMany.mock.calls[0][0].where.createdAt.lt;
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 90);
    // Allow 1 second tolerance
    expect(Math.abs(cutoffArg.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
  });

  it("accepts a custom retention period", async () => {
    mockDb.barEvent.deleteMany.mockResolvedValue({ count: 50 });

    const deleted = await purgeExpiredEvents(30);

    expect(deleted).toBe(50);
    const cutoffArg = mockDb.barEvent.deleteMany.mock.calls[0][0].where.createdAt.lt;
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 30);
    expect(Math.abs(cutoffArg.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
  });

  it("returns 0 when no events to purge", async () => {
    mockDb.barEvent.deleteMany.mockResolvedValue({ count: 0 });
    expect(await purgeExpiredEvents()).toBe(0);
  });
});

describe("purgeExpiredSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes sessions past their expiry date", async () => {
    mockDb.session.deleteMany.mockResolvedValue({ count: 5 });

    const deleted = await purgeExpiredSessions();

    expect(deleted).toBe(5);
    expect(mockDb.session.deleteMany).toHaveBeenCalledWith({
      where: { expires: { lt: expect.any(Date) } },
    });
  });

  it("returns 0 when no expired sessions", async () => {
    mockDb.session.deleteMany.mockResolvedValue({ count: 0 });
    expect(await purgeExpiredSessions()).toBe(0);
  });
});

describe("GET /api/cleanup", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CLEANUP_SECRET: "test-secret-123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function makeRequest(secret?: string) {
    const url = secret
      ? `http://localhost/api/cleanup?secret=${secret}`
      : "http://localhost/api/cleanup";
    return new Request(url);
  }

  it("returns 401 when secret is missing", async () => {
    const response = await loader({
      request: makeRequest(),
      context: {},
      params: {},
      unstable_pattern: "",
    });
    expect(response.status).toBe(401);
  });

  it("returns 401 when secret is wrong", async () => {
    const response = await loader({
      request: makeRequest("wrong-secret"),
      context: {},
      params: {},
      unstable_pattern: "",
    });
    expect(response.status).toBe(401);
  });

  it("returns 500 when CLEANUP_SECRET is not configured", async () => {
    delete process.env.CLEANUP_SECRET;
    const response = await loader({
      request: makeRequest("anything"),
      context: {},
      params: {},
      unstable_pattern: "",
    });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("CLEANUP_SECRET not configured");
  });

  it("purges events and sessions when secret is valid", async () => {
    mockDb.barEvent.deleteMany.mockResolvedValue({ count: 200 });
    mockDb.session.deleteMany.mockResolvedValue({ count: 3 });

    const response = await loader({
      request: makeRequest("test-secret-123"),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.deletedEvents).toBe(200);
    expect(body.deletedSessions).toBe(3);
    expect(body.timestamp).toBeDefined();
  });

  it("returns 500 when purge throws", async () => {
    mockDb.barEvent.deleteMany.mockRejectedValue(new Error("DB down"));

    const response = await loader({
      request: makeRequest("test-secret-123"),
      context: {},
      params: {},
      unstable_pattern: "",
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Cleanup failed");
  });
});
