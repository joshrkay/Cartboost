-- Restructure BarEvent: replace loose shopDomain/variant strings with a proper
-- foreign key to ABVariant for relational integrity and correct analytics.

-- Drop old indexes and columns
DROP INDEX IF EXISTS "BarEvent_shopDomain_variant_eventType_idx";
ALTER TABLE "BarEvent" DROP COLUMN "shopDomain";
ALTER TABLE "BarEvent" DROP COLUMN "variant";

-- Add variantId column (nullable first for safety, then backfill if needed)
ALTER TABLE "BarEvent" ADD COLUMN "variantId" TEXT;

-- Delete any orphaned BarEvent rows that can't be linked to a variant
DELETE FROM "BarEvent" WHERE "variantId" IS NULL;

-- Make variantId required
ALTER TABLE "BarEvent" ALTER COLUMN "variantId" SET NOT NULL;

-- Add foreign key constraint with cascade delete
ALTER TABLE "BarEvent" ADD CONSTRAINT "BarEvent_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ABVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create new index for efficient queries
CREATE INDEX "BarEvent_variantId_eventType_idx" ON "BarEvent"("variantId", "eventType");
