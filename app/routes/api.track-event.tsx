import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const VALID_EVENT_TYPES = ["impression", "click", "add_to_cart", "conversion"];
const VALID_VARIANT_PATTERN = /^[A-Za-z0-9]{1,10}$/;

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const { session } = await authenticate.public.appProxy(request);

        if (!session?.shop) {
            return new Response("Unauthorized", { status: 401 });
        }

        const { variant, eventType } = await request.json();

        if (!variant || !VALID_VARIANT_PATTERN.test(variant)) {
            return new Response("Invalid variant", { status: 400 });
        }

        if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
            return new Response("Invalid event type", { status: 400 });
        }

        await db.barEvent.create({
            data: {
                shopDomain: session.shop,
                variant,
                eventType,
            },
        });

        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("Tracking Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
};
