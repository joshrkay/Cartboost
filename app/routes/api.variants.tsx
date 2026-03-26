import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActiveTest, getOrCreateABTest, getVariantWeights } from "../models/analytics.server";
import { checkRateLimit } from "../utils/rate-limiter.server";
import { validateCurrencyThresholds } from "../utils/experiment-helpers";
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

        const { allowed } = checkRateLimit(`variants:${session.shop}`, {
            limit: 10_000,
            windowMs: 60_000,
        });

        if (!allowed) {
            return Response.json({ error: "Too Many Requests" }, { status: 429 });
        }

        // Try active test first; fall back to auto-create for backward compat
        let test = await getActiveTest(session.shop);
        if (!test) {
            test = await getOrCreateABTest(session.shop);
        }

        const shopPlan = await db.shopPlan.findUnique({ where: { shop: session.shop } });
        const plan = shopPlan?.plan ?? "free";
        const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

        const variants = test.variants.map((v) => ({
            id: v.id,
            name: v.name,
            config: v.config,
        }));

        // Compute weights for auto-optimize mode (Pro/Premium only)
        let weights: Record<string, number> | undefined;
        if (test.mode === "auto_optimize" && plan !== "free") {
            weights = await getVariantWeights(test.id);
        }

        const validatedThresholds = validateCurrencyThresholds(test.currencyThresholds);

        return Response.json({
            variants,
            plan,
            maxVariants: limits.maxVariants,
            allowedTestModes: limits.allowedTestModes,
            mode: test.mode,
            ...(weights ? { weights } : {}),
            ...(validatedThresholds ? { currencyThresholds: validatedThresholds } : {}),
        });
    } catch (error) {
        console.error("Variants API error", {
            error: error instanceof Error ? error.message : "Unknown error",
        });
        return new Response("Internal Server Error", { status: 500 });
    }
};
