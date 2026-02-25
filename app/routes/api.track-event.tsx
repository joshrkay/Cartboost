import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const VALID_EVENT_TYPES = ["impression", "click", "add_to_cart", "conversion"];
const VALID_CUID_PATTERN = /^[a-z0-9]{20,30}$/;

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const { session } = await authenticate.public.appProxy(request);

        if (!session?.shop) {
            return new Response("Unauthorized", { status: 401 });
        }

        const { variantId, eventType } = await request.json();

        if (!variantId || !VALID_CUID_PATTERN.test(variantId)) {
            return new Response("Invalid variantId", { status: 400 });
        }

        if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
            return new Response("Invalid event type", { status: 400 });
        }

        // Verify the variant exists and belongs to this shop
        const variant = await db.aBVariant.findUnique({
            where: { id: variantId },
            include: { test: { select: { shop: true } } },
        });

        if (!variant || variant.test.shop !== session.shop) {
            return new Response("Invalid variantId", { status: 400 });
        }

        await db.barEvent.create({
            data: {
                variantId,
                eventType,
            },
        });

        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("Tracking Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
};
