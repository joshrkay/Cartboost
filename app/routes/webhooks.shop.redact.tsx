import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteAllShopData } from "../models/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  try {
    await deleteAllShopData(shop);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Shop redact failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Internal Server Error", { status: 500 });
  }
};
