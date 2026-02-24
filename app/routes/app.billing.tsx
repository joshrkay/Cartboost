import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (plan !== "pro" && plan !== "premium") {
    return redirect("/app");
  }

  const planName = plan === "pro" ? PLANS.pro : PLANS.premium;

  await billing.request({
    plan: planName,
    isTest: true,
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback`,
  });

  return redirect("/app");
};
