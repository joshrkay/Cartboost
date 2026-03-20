import { vi } from "vitest";
vi.mock("../db.server", () => ({
  default: {
    barEvent: { count: vi.fn(), create: vi.fn(), groupBy: vi.fn(), deleteMany: vi.fn() },
    aBTest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    aBVariant: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    session: { deleteMany: vi.fn() },
    shopPlan: { findUnique: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
