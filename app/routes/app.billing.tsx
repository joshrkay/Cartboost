import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";
import db from "../db.server";
export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;
  const planName = plan === "pro" ? PLANS.pro : PLANS.premium;
  await billing.request({
    plan: planName,
    isTest: true,
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
  });
  return redirect("/app");
};
export const loader = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app");
};
