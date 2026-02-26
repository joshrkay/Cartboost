# CartBoost

Shopify embedded app for A/B testing free shipping bars. Built with React Router v7, TypeScript, PostgreSQL (Prisma), Shopify Polaris, deployed on Vercel.

## Commands

- `npm run dev` / `shopify app dev` — local development
- `npm run build` — `prisma generate && react-router build`
- `npm run typecheck` — `react-router typegen && tsc --noEmit`
- `npm run lint` — ESLint (flat config)
- `npx vitest run` — run all tests
- `npx vitest run --coverage` — run tests with coverage report

## Project Structure

- `app/routes/` — React Router file-based routes (loaders, actions, components)
- `app/models/analytics.server.ts` — A/B test statistics (z-test confidence, lift, date ranges)
- `app/utils/` — rate limiter, request debug helpers
- `app/test/` — Vitest test files (mock setup in `app/test/setup.ts`)
- `extensions/free-shipping-bar/` — Shopify theme app extension (Liquid + JS)
- `prisma/schema.prisma` — database schema (source of truth for all models)

## Critical Rules

### Always read `prisma/schema.prisma` before writing database code

The schema has been restructured multiple times. Do NOT assume model names, field names, or relations from memory. Always read the current schema first. Key facts:
- `AnalyticsEvent` model was removed — do not reference it
- `BarEvent` links to `ABVariant` via `variantId` (not `shopDomain`)
- `BarEvent` has no `shop` or `shopDomain` field — shop data lives on `ABTest`
- Cascade deletes: `ABTest` → `ABVariant` → `BarEvent`

### Always `git fetch` and check `origin/main` before creating a branch

The local `main` can be stale. Before writing code, run:
```
git fetch origin main
git log --oneline origin/main -5
```
If the feature you're implementing already exists on `origin/main`, do not duplicate it.

### Always rebase on `origin/main` before pushing a PR branch

This ensures your branch has the latest schema and avoids CI failures from stale types:
```
git fetch origin main
git rebase origin/main
```

### Run typecheck before pushing

CI runs `react-router typegen && tsc --noEmit`. Always verify locally first:
```
npm run typecheck
```

### Prisma client types require `prisma generate`

CI runs `npx prisma generate` before typecheck. If you get errors like `Property 'X' does not exist on type 'PrismaClient'`, regenerate:
```
npx prisma generate
```

## Database Models (quick reference)

- `Session` — Shopify OAuth sessions (shop, accessToken, user info)
- `ABTest` — A/B test per shop (shop, name, status)
- `ABVariant` — test variant (testId → ABTest, name, config JSON)
- `BarEvent` — anonymous event (variantId → ABVariant, eventType: impression/add_to_cart)
- `ShopPlan` — billing tier per shop (shop, plan: free/pro/premium)

## Testing Conventions

- Tests use Vitest with global mocks defined in `app/test/setup.ts`
- DB is mocked — tests never hit a real database
- Route tests import and call the actual `loader`/`action` functions
- When adding new Prisma model methods to code, add them to the mock in `setup.ts` too
- Use `.tsx` for all route files (not `.jsx`)

## Known Issue: `plan.md` / `PLAN.md` case conflict

Git tracks both `plan.md` and `PLAN.md` but macOS treats them as one file. If this causes unstaged changes that block git operations, use:
```
git update-index --assume-unchanged plan.md
git update-index --assume-unchanged PLAN.md
```
