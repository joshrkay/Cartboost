-- DropTable
DROP TABLE "AnalyticsEvent";

-- AlterTable: remove redundant timestamp column from BarEvent
ALTER TABLE "BarEvent" DROP COLUMN "timestamp";

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE INDEX "ABTest_shop_idx" ON "ABTest"("shop");

-- CreateIndex
CREATE INDEX "BarEvent_shopDomain_variant_eventType_idx" ON "BarEvent"("shopDomain", "variant", "eventType");
