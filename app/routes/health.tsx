import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await db.$queryRaw`SELECT 1`;

    return Response.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Health check failed: database query failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
};
