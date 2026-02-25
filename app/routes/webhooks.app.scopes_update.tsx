import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    try {
        const current = Array.isArray(payload.current) ? payload.current : [];
        if (session && current.length > 0) {
            await db.session.update({
                where: { id: session.id },
                data: { scope: current.toString() },
            });
        }
        return new Response(null, { status: 200 });
    } catch (error) {
        console.error(`Scopes update failed for ${shop}:`, error);
        return new Response("Internal Server Error", { status: 500 });
    }
};
