import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  try {
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`App uninstall cleanup failed for ${shop}:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
