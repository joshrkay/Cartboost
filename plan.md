# Plan: Implement GDPR Webhook Handlers

## Context

Shopify requires all public apps to handle three GDPR webhooks for App Store approval:

1. **`customers/data_request`** — Return all stored data for a given customer
2. **`customers/redact`** — Delete all stored data for a given customer
3. **`shop/redact`** — Delete all stored data for a given shop (48 hours after uninstall)

CartBoost currently has placeholder stubs for all three. They authenticate the webhook but perform no data operations.

## Data Inventory

CartBoost stores the following data per shop (from `prisma/schema.prisma`):

| Model | Keyed By | Contains PII | Notes |
|-------|----------|-------------|-------|
| `Session` | `shop` | Yes (firstName, lastName, email, userId) | OAuth sessions |
| `ABTest` | `shop` | No | A/B test configurations |
| `ABVariant` | via `ABTest.testId` | No | Test variant configs |
| `BarEvent` | `shopDomain` | No | Impression/conversion events (no customer identifiers) |
| `ShopPlan` | `shop` | No | Billing plan info |

**Key observation:** CartBoost does **not** store any customer-specific data. `BarEvent` tracks anonymous impressions keyed by `shopDomain` + `variant`, with no customer ID, email, or identifying information. The `Session` model stores **merchant** data (the shop owner), not end-customer data.

This means:
- **Customer data request / redact**: No customer data to return or delete. The handlers should log the request and return 200 (Shopify accepts this).
- **Shop redact**: Must delete **all** shop data — Sessions, ABTests (cascades to ABVariants), BarEvents, and ShopPlan.

## Implementation Steps

### Step 1: Convert GDPR webhook files from `.jsx` to `.tsx`

The existing GDPR stubs are `.jsx` while the rest of the codebase uses `.tsx`. Convert all three files for consistency and type safety:
- `webhooks.customers.data_request.jsx` → `.tsx`
- `webhooks.customers.redact.jsx` → `.tsx`
- `webhooks.shop.redact.jsx` → `.tsx`

### Step 2: Implement `webhooks.customers.data_request.tsx`

Since CartBoost stores no customer-identifiable data, this handler will:
- Authenticate the webhook
- Log the request with shop, customer ID, and data request ID from the payload
- Return 200 (no customer data to report)

Payload shape from Shopify:
```json
{
  "shop_id": 123,
  "shop_domain": "example.myshopify.com",
  "customer": { "id": 456, "email": "customer@example.com", "phone": "..." },
  "orders_requested": [789],
  "data_request": { "id": 101 }
}
```

### Step 3: Implement `webhooks.customers.redact.tsx`

Since CartBoost stores no customer-identifiable data, this handler will:
- Authenticate the webhook
- Log the request with shop and customer ID from the payload
- Return 200 (no customer data to delete)

Payload shape from Shopify:
```json
{
  "shop_id": 123,
  "shop_domain": "example.myshopify.com",
  "customer": { "id": 456, "email": "customer@example.com", "phone": "..." },
  "orders_to_redact": [789]
}
```

### Step 4: Implement `webhooks.shop.redact.tsx`

This is the critical handler. When Shopify sends this webhook (48 hours after app uninstall), we must delete **all** data for the shop. Following the same pattern as `webhooks.app.uninstalled.tsx`:

- Authenticate the webhook
- Extract `shop_domain` from the payload
- Delete all records across all tables for that shop domain:
  1. `BarEvent` — delete where `shopDomain` matches
  2. `ABTest` — delete where `shop` matches (cascades to `ABVariant` via `onDelete: Cascade`)
  3. `ShopPlan` — delete where `shop` matches
  4. `Session` — delete where `shop` matches
- Use a Prisma transaction (`db.$transaction`) to ensure atomicity
- Log the deletion for audit purposes
- Return 200

Payload shape from Shopify:
```json
{
  "shop_id": 123,
  "shop_domain": "example.myshopify.com"
}
```

### Step 5: Verify route registration

Confirm the webhook URLs in `shopify.app.toml` match the file-based routing:
- `/webhooks/customers/data_request` → `webhooks.customers.data_request.tsx` ✓
- `/webhooks/customers/redact` → `webhooks.customers.redact.tsx` ✓
- `/webhooks/shop/redact` → `webhooks.shop.redact.tsx` ✓

No changes needed to `shopify.app.toml`.

## Files to modify

| File | Action |
|------|--------|
| `app/routes/webhooks.customers.data_request.jsx` | Delete (replaced by .tsx) |
| `app/routes/webhooks.customers.data_request.tsx` | Create — customer data request handler |
| `app/routes/webhooks.customers.redact.jsx` | Delete (replaced by .tsx) |
| `app/routes/webhooks.customers.redact.tsx` | Create — customer data deletion handler |
| `app/routes/webhooks.shop.redact.jsx` | Delete (replaced by .tsx) |
| `app/routes/webhooks.shop.redact.tsx` | Create — full shop data deletion handler |

## Risks & Considerations

- **Idempotency**: Shopify may send these webhooks multiple times. All handlers must be safe to run repeatedly (use `deleteMany` which succeeds even if no records exist).
- **The `shop/redact` webhook arrives ~48 hours after uninstall**: The `app.uninstalled` handler already deletes sessions. The `shop/redact` handler should still attempt to delete everything (idempotent) since non-session data (ABTest, BarEvent, ShopPlan) is NOT cleaned up on uninstall.
- **No schema changes needed**: The current schema has the right indexes (`shop`, `shopDomain`) to support efficient deletions.
- **Transaction safety**: Using `$transaction` for shop redact ensures partial failures don't leave orphaned data.
