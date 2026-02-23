import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";
export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;
  const planName = plan === "pro" ? PLANS.pro : PLANS.premium;
  // billing.request throws a redirect to Shopify's payment page internally
  await billing.request({
    plan: planName,
    isTest: true,
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback`,
  });
  // This line is only reached if billing.request doesn't redirect (shouldn't happen)
  return redirect("/app");
};
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app");
};
