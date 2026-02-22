import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const { variant, eventType } = await request.json();
        const url = new URL(request.url);
        const shopDomain = url.searchParams.get("shop");

        if (!shopDomain) {
            return new Response("Missing shop parameter", { status: 400 });
        }

        await db.barEvent.create({
            data: {
                shopDomain,
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

// Also handle GET just in case someone hits it accidentally
export const loader = async () => {
    return new Response("Event tracking endpoint is active.", { status: 200 });
};
