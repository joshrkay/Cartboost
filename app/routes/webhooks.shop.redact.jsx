import { authenticate } from "../shopify.server";
export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  // Handle shop redact request - GDPR compliance
  // You must delete all data you store for this shop
  // This is a placeholder - implement actual data deletion logic here
  return new Response(null, { status: 200 });
};
