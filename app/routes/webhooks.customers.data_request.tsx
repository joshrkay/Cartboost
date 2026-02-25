import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // CartBoost does not store any customer-identifiable data.
  // BarEvent tracks anonymous impressions with no customer ID or email.
  // Nothing to report for this customer data request.
  const customerId = (payload as any)?.customer?.id;
  const dataRequestId = (payload as any)?.data_request?.id;
  console.log(
    `Customer data request ${dataRequestId} for customer ${customerId} on ${shop} — no customer data stored`,
  );

  return new Response(null, { status: 200 });
};
