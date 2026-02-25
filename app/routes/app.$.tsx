import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// Catch-all route for unmatched /app/* paths.
// Redirects to the main app page instead of throwing a 404.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app${url.search}`);
};
