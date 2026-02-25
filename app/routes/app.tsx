import { Outlet, useLoaderData, useRouteError } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import {
  logRequestError,
  redirectToLoginForEmbeddedShop,
  shouldRecoverFromResponseError,
} from "../utils/request-debug.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
  } catch (error) {
    if (shouldRecoverFromResponseError(error) || !(error instanceof Response)) {
      logRequestError("Admin authentication failed for embedded app route", request, error);
      const loginRedirect = redirectToLoginForEmbeddedShop(request);
      if (loginRedirect) throw loginRedirect;
    }

    throw error;
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider embedded apiKey={apiKey}>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};