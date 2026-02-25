import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session } = await authenticate.webhook(request);

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
        console.error("Scopes update failed", {
            error: error instanceof Error ? error.message : String(error),
        });
        return new Response("Internal Server Error", { status: 500 });
    }
};
