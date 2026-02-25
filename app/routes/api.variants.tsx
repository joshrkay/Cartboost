import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateABTest } from "../models/analytics.server";
import { checkRateLimit } from "../utils/rate-limiter.server";
import db from "../db.server";

/** Plan-specific limits enforced server-side. */
const PLAN_LIMITS: Record<string, { maxVariants: number; allowedTestModes: string[] }> = {
    free: { maxVariants: 1, allowedTestModes: ["same_message"] },
    pro: { maxVariants: 3, allowedTestModes: ["same_message"] },
    premium: { maxVariants: 5, allowedTestModes: ["same_message", "random_message_random_color", "paired"] },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    try {
        const { session } = await authenticate.public.appProxy(request);

        if (!session?.shop) {
            return new Response("Unauthorized", { status: 401 });
        }

        // Rate limit is per-shop but all visitors share this bucket,
        // so the limit must accommodate storefront traffic volume.
        const { allowed } = checkRateLimit(`variants:${session.shop}`, {
            limit: 10_000,
            windowMs: 60_000,
        });

        if (!allowed) {
            return Response.json({ error: "Too Many Requests" }, { status: 429 });
        }

        const [test, shopPlan] = await Promise.all([
            getOrCreateABTest(session.shop),
            db.shopPlan.findUnique({ where: { shop: session.shop } }),
        ]);

        const plan = shopPlan?.plan ?? "free";
        const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

        const variants = test.variants.map((v: any) => ({
            id: v.id,
            name: v.name,
            config: v.config,
        }));

        return Response.json({
            variants,
            plan,
            maxVariants: limits.maxVariants,
            allowedTestModes: limits.allowedTestModes,
        });
    } catch (error) {
        console.error("Variants API error", {
            error: error instanceof Error ? error.message : "Unknown error",
        });
        return new Response("Internal Server Error", { status: 500 });
    }
};
