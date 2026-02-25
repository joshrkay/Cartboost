import { vi } from "vitest";
vi.mock("../db.server", () => ({
  default: {
    barEvent: { count: vi.fn(), create: vi.fn() },
    aBTest: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    aBVariant: { findUnique: vi.fn() },
    shopPlan: { findUnique: vi.fn() },
  },
}));
