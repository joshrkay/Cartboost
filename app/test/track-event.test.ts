import { describe, it, expect, beforeEach, vi } from "vitest";
import db from "../db.server";
const mockDb = db as any;
async function handleTrackEvent(body: { variant?: string; eventType?: string }, shop: string) {
  const { variant, eventType } = body;
  if (!variant || !eventType) return { status: 400 };
  await db.barEvent.create({
    data: { shopDomain: shop, variant, eventType, timestamp: new Date() },
  });
  return { status: 204 };
}
describe("track-event API", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns 204 and writes BarEvent row for impression", async () => {
    mockDb.barEvent.create.mockResolvedValue({});
    const result = await handleTrackEvent({ variant: "A", eventType: "impression" }, "cartboost-test-3.myshopify.com");
    expect(result.status).toBe(204);
    expect(mockDb.barEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ variant: "A", eventType: "impression", shopDomain: "cartboost-test-3.myshopify.com" }),
      })
    );
  });
  it("returns 204 for conversion events", async () => {
    mockDb.barEvent.create.mockResolvedValue({});
    const result = await handleTrackEvent({ variant: "B", eventType: "conversion" }, "test.myshopify.com");
    expect(result.status).toBe(204);
  });
  it("returns 204 for Free tier impressions", async () => {
    mockDb.barEvent.create.mockResolvedValue({});
    const result = await handleTrackEvent({ variant: "Free", eventType: "impression" }, "test.myshopify.com");
    expect(result.status).toBe(204);
  });
  it("returns 400 when variant is missing", async () => {
    const result = await handleTrackEvent({ eventType: "impression" }, "test.myshopify.com");
    expect(result.status).toBe(400);
    expect(mockDb.barEvent.create).not.toHaveBeenCalled();
  });
  it("returns 400 when eventType is missing", async () => {
    const result = await handleTrackEvent({ variant: "A" }, "test.myshopify.com");
    expect(result.status).toBe(400);
    expect(mockDb.barEvent.create).not.toHaveBeenCalled();
  });
});
