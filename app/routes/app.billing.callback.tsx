import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: [PLANS.pro, PLANS.premium],
    isTest: process.env.NODE_ENV !== "production",
  });

  if (hasActivePayment) {
    const activePlan =
      appSubscriptions[0]?.name === PLANS.premium ? "premium" : "pro";
    try {
      await db.shopPlan.upsert({
        where: { shop: session.shop },
        update: { plan: activePlan },
        create: { shop: session.shop, plan: activePlan },
      });
    } catch (error) {
      console.error("Failed to persist billing plan:", error);
    }
  }

  return redirect("/app");
};
