import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);

  // CartBoost does not store any customer-identifiable data.
  // BarEvent tracks anonymous impressions with no customer ID or email.
  // Nothing to delete for this customer redact request.
  return new Response(null, { status: 200 });
};
