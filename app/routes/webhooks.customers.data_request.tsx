import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // This app does not store any customer-identifiable data (no customer IDs,
  // emails, or personal information in BarEvent or AnalyticsEvent records).
  // Session data contains shop-owner info only, not end-customer data.
  //
  // Per Shopify GDPR requirements, we respond with the data we have for this
  // shop. Since there is no customer-specific data, we return an empty dataset.

  const customerData = {
    shop,
    customer: payload?.customer,
    data_stored: [],
  };

  console.log(
    `Customer data request processed for ${shop} - no customer PII stored`,
  );

  return new Response(JSON.stringify(customerData), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
