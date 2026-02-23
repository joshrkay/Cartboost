import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, json } from "react-router";
import { authenticate, PLANS } from "../shopify.server";
export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;
  const planName = plan === "pro" ? PLANS.pro : PLANS.premium;
  const billingCheck = await billing.require({
    plans: [planName],
    isTest: true,
    onFailure: async () => billing.request({
      plan: planName,
      isTest: true,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback`,
    }),
  });
  return redirect("/app");
};
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app");
};
