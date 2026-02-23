import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Handle customer data request - GDPR compliance
  // You should return all customer data you store for the given shop/customer
  // This is a placeholder - implement actual data retrieval logic here

  return new Response(null, { status: 200 });
};
