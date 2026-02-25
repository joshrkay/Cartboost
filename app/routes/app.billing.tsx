import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;

  if (plan !== "pro" && plan !== "premium") {
    return redirect("/app");
  }

  const planName = plan === "pro" ? PLANS.pro : PLANS.premium;

  await billing.request({
    plan: planName,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback`,
  });

  return redirect("/app");
};
