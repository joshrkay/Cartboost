import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";
import db from "../db.server";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") as string;
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: [PLANS.pro, PLANS.premium],
    isTest: true,
  });
  if (hasActivePayment) {
    const activePlan = appSubscriptions[0]?.name === PLANS.premium ? "premium" : "pro";
    await db.shopPlan.upsert({
      where: { shop: session.shop },
      update: { plan: activePlan },
      create: { shop: session.shop, plan: activePlan },
    });
  }
  return redirect("/app");
};
