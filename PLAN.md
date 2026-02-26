# Plan: Fix Critical Issues in Cartboost

## Issue 1 — Security: Unauthenticated track-event endpoint
**File:** `app/routes/api.track-event.tsx`

**Problem:** The endpoint accepts unauthenticated POST requests. No input validation, no rate limiting, and `shop` comes from a spoofable query string.

**Fix:**
- Replace manual `shop` query param handling with `authenticate.public.appProxy(request)` from `shopify.server.ts`. This validates the HMAC signature Shopify adds when routing through the app proxy, confirming the request is legitimate.
- Get the `shop` domain from the authenticated session instead of the query string.
- Add allowlist validation on `variant` (alphanumeric, max 10 chars) and `eventType` (must be one of: `impression`, `click`, `add_to_cart`, `conversion`).
- Remove the GET loader (it leaks endpoint existence for no benefit).

---

## Issue 2 — Client ID in `shopify.app.toml`
**File:** `shopify.app.toml`

**Problem:** `client_id` is committed. This is required by the Shopify CLI and is semi-public by design. No action needed — just confirm `SHOPIFY_API_SECRET` is NOT committed anywhere.

**Fix:** Verify only. Grep the repo for any secret/key leaks. No code changes required.

---

## Issue 3 — `currentPlan` never returned from loader
**File:** `app/routes/app._index.tsx`

**Problem:** The component destructures `currentPlan` from `useLoaderData()` but the loader only returns `{ shop, variants }`. `currentPlan` is always `undefined`, breaking the entire plan/upgrade UI section.

**Fix:**
- In the loader, query `db.shopPlan.findUnique({ where: { shop } })` to get the merchant's current plan.
- Default to `"free"` if no record exists.
- Return `currentPlan` alongside `shop` and `variants`.
- Import `db` is already present (line 27) so no new imports needed.

---

## Issue 4 — Billing action ignores POST data
**File:** `app/routes/app.billing.tsx`

**Problem:** The dashboard submits a POST with `{ plan }` via `fetcher.submit`, but the `action` handler ignores form data and just redirects. Meanwhile, the `loader` (GET) is what calls `billing.request()` — but loaders don't receive form submissions.

**Fix:**
- Move the `billing.request()` logic from the `loader` into the `action`.
- Read the `plan` value from the form data (`request.formData()`).
- Map `plan` to the correct `PLANS` constant and call `billing.request()`.
- Keep the loader as a simple redirect (or remove it) since billing should only be initiated via POST.

---

## Issue 5 — Hardcoded "+12%" and "+8%" badges
**File:** `app/routes/app._index.tsx` (lines 114, 124)

**Problem:** The "vs last period" badges show hardcoded percentages that don't reflect real data.

**Fix:**
- Remove the fake comparison badges entirely. The app doesn't track historical period data, so there's nothing to compare against.
- Replace with neutral context text (e.g., "All time" or "Since test started").

---

## Issue 6 — Hardcoded "Variation B is leading"
**File:** `app/routes/app._index.tsx` (line 144)

**Problem:** Static text claims Variation B is leading regardless of actual data.

**Fix:**
- Compute the leading variant from the `variants` data (the one with the highest conversion rate, excluding the control if desired).
- Display the actual leading variant name, or "No data yet" if there are no impressions.
