import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // This app does not store any customer-identifiable data.
  // BarEvent and AnalyticsEvent records are anonymous (no customer IDs,
  // emails, or personal information). Session data contains shop-owner
  // info only, not end-customer data.
  //
  // No deletion is required, but we log the request for audit purposes.

  console.log(
    `Customer redact processed for ${shop}, customer ${payload?.customer?.id ?? "unknown"} - no customer PII stored`,
  );

  return new Response(null, { status: 200 });
};
