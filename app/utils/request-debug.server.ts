import { redirect } from "react-router";

interface RequestDebugContext {
  requestId: string;
  method: string;
  pathname: string;
  shop: string | null;
  host: string | null;
}

function toErrorMetadata(error: unknown) {
  if (error instanceof Response) {
    return {
      type: "response",
      status: error.status,
      statusText: error.statusText,
    };
  }

  if (error instanceof Error) {
    return {
      type: "error",
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    type: "unknown",
    value: String(error),
  };
}

export function getRequestDebugContext(request: Request): RequestDebugContext {
  const url = new URL(request.url);
  return {
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    method: request.method,
    pathname: url.pathname,
    shop: url.searchParams.get("shop"),
    host: url.searchParams.get("host"),
  };
}

export function logRequestError(
  message: string,
  request: Request,
  error: unknown,
  extras?: Record<string, unknown>,
) {
  const context = getRequestDebugContext(request);

  console.error(message, {
    ...context,
    ...extras,
    error: toErrorMetadata(error),
  });
}

export function redirectToLoginForEmbeddedShop(request: Request) {
  const { shop } = getRequestDebugContext(request);
  if (!shop) return null;
  return redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
}

export function shouldRecoverFromResponseError(error: unknown) {
  return error instanceof Response && error.status >= 500;
}
