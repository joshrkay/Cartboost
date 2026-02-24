import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app");
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan");

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
