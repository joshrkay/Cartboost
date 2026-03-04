-- CreateTable
CREATE TABLE "ShopPlan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopPlan_shop_key" ON "ShopPlan"("shop");
