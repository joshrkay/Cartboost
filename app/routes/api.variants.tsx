import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateABTest } from "../models/analytics.server";
import { checkRateLimit } from "../utils/rate-limiter.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    try {
        const { session } = await authenticate.public.appProxy(request);

        if (!session?.shop) {
            return new Response("Unauthorized", { status: 401 });
        }

        const { allowed } = checkRateLimit(`variants:${session.shop}`, {
            limit: 60,
            windowMs: 60_000,
        });

        if (!allowed) {
            return Response.json({ error: "Too Many Requests" }, { status: 429 });
        }

        const test = await getOrCreateABTest(session.shop);
        const variants = test.variants.map((v: any) => ({
            id: v.id,
            name: v.name,
            config: v.config,
        }));

        return Response.json({ variants });
    } catch (error) {
        console.error("Variants API error", {
            error: error instanceof Error ? error.message : "Unknown error",
        });
        return new Response("Internal Server Error", { status: 500 });
    }
};
