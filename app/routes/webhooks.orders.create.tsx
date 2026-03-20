import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

interface OrderWebhookPayload {
  id: number;
  total_price: string;
  currency: string;
  note_attributes?: Array<{ name: string; value: string }>;
  cart_token?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const order = payload as unknown as OrderWebhookPayload;

  try {
    // Extract CartBoost variant ID from cart/note attributes
    const attributes = order.note_attributes ?? [];
    const variantAttr = attributes.find(
      (a) => a.name === "_cartboost_variant",
    );

    if (!variantAttr?.value) {
      // No CartBoost attribution — skip silently
      return new Response(null, { status: 200 });
    }

    const variantId = variantAttr.value;

    // Validate variant exists and belongs to this shop
    const variant = await db.aBVariant.findUnique({
      where: { id: variantId },
      include: { test: { select: { shop: true } } },
    });

    if (!variant || variant.test.shop !== shop) {
      return new Response(null, { status: 200 });
    }

    const revenue = parseFloat(order.total_price);
    if (isNaN(revenue) || revenue <= 0) {
      return new Response(null, { status: 200 });
    }

    await db.barEvent.create({
      data: {
        variantId,
        eventType: "order_completed",
        revenue,
        currency: order.currency || "USD",
      },
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Order webhook processing failed", {
      error: error instanceof Error ? error.message : String(error),
      shop,
      orderId: order.id,
    });
    return new Response("Internal Server Error", { status: 500 });
  }
};
