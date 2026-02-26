import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkRateLimit } from "../utils/rate-limiter.server";

const VALID_EVENT_TYPES = ["impression", "click", "add_to_cart", "conversion"];
const VALID_CUID_PATTERN = /^[a-z0-9]{20,30}$/;

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    const { session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Rate limit is per-shop but all visitors share this bucket,
    // so the limit must accommodate storefront traffic volume.
    const { allowed } = checkRateLimit(`track:${session.shop}`, {
        limit: 10_000,
        windowMs: 60_000,
    });

    if (!allowed) {
        return new Response("Too Many Requests", { status: 429 });
    }

    let body: { variantId?: unknown; eventType?: unknown };
    try {
        body = await request.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const { variantId, eventType } = body;

    if (typeof variantId !== "string" || !VALID_CUID_PATTERN.test(variantId)) {
        return new Response("Invalid variantId", { status: 400 });
    }

    if (typeof eventType !== "string" || !VALID_EVENT_TYPES.includes(eventType)) {
        return new Response("Invalid event type", { status: 400 });
    }

    try {
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
        console.error("Tracking error", {
            error: error instanceof Error ? error.message : "Unknown error",
        });
        return new Response("Internal Server Error", { status: 500 });
    }
};
