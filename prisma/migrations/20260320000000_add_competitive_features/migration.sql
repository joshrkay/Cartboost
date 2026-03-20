-- Phase 3: Experiment Builder fields
ALTER TABLE "ABTest" ADD COLUMN "description" TEXT;
ALTER TABLE "ABTest" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Phase 1: Auto-Optimization mode
ALTER TABLE "ABTest" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'manual';

-- Phase 2: Revenue Attribution fields
ALTER TABLE "BarEvent" ADD COLUMN "revenue" DECIMAL(65,30);
ALTER TABLE "BarEvent" ADD COLUMN "currency" TEXT;
