# Cartboost Pricing Strategy

## Current Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 1 test, 1K visitors |
| **Pro** | $19/mo | Unlimited tests, 50K visitors |
| **Premium** | $49/mo | Everything + priority support |

---

## Pricing Rationale

### Free Tier

**Purpose:** Drive adoption, build user base

**Features:**
- 1 active test
- 1,000 monthly visitors tracked
- Basic analytics
- Email support

**Why it works:**
- Competitors: Convert ($49), Neat ($19)
- Free tier removes friction
- Users outgrow free → upgrade

---

### Pro Tier ($19/mo)

**Purpose:** Core revenue driver

**Features:**
- Unlimited A/B tests
- 50,000 monthly visitors
- Advanced analytics
- Email support

**Target:** Small-medium Shopify stores

**Competitor Comparison:**
- Convert: $49/mo
- Neat: $19/mo
- **Cartboost: $19/mo** = same price, more features

---

### Premium Tier ($49/mo)

**Purpose:** Enterprise/premium features

**Features:**
- Everything in Pro
- Unlimited visitors
- Priority support
- API access
- Custom integrations

**Target:** Large stores, agencies

**Competitor Comparison:**
- Optimizely: $500+/mo
- **Cartboost: $49/mo** = 90% cheaper

---

## Pricing Page Copy

### Free Tier

```
START FREE
Perfect for new stores

✓ 1 active A/B test
✓ 1,000 visitors/month
✓ Basic analytics
✓ Email support

$0 forever

[Start Free]
```

### Pro Tier

```
PRO
For growing stores

✓ Unlimited A/B tests
✓ 50,000 visitors/month
✓ Advanced analytics
✓ Priority support

$19/month

[Start Pro]
[Most Popular badge]
```

### Premium Tier

```
PREMIUM
For power users

✓ Everything in Pro
✓ Unlimited visitors
✓ Priority support
✓ API access
✓ Custom integrations

$49/month

[Go Premium]
```

---

## Upgrade Pathways

### Free → Pro

**Trigger:** User hits 1K visitor limit

**Email:**
```
Subject: Your test is getting popular! 🚀

Hi [Name],

Congratulations! Your A/B test has reached 1,000 visitors.

Your test results are statistically significant, but you've hit our free tier limit.

Upgrade to Pro for:
- Unlimited tests
- 50K more visitors
- Advanced analytics

Upgrade now → [link]

Questions? Reply here!
```

### Pro → Premium

**Trigger:** User needs more visitors or API

**Email:**
```
Subject: Ready for more? 🚀

Hi [Name],

You're crushing it! Your tests are driving real results.

Ready for the next level?

Premium includes:
- Unlimited visitors
- API access
- Priority support

Upgrade to Premium → [link]
```

---

## Discounts

### Annual Discount

| Plan | Monthly | Annual (20% off) |
|------|---------|------------------|
| Pro | $19 | $15/mo ($180/yr) |
| Premium | $49 | $39/mo ($468/yr) |

**Copy:** "Save 20% with annual billing"

---

### Founder/Launch Discount (Limited)

| Plan | Launch Price | After Launch |
|------|-------------|---------------|
| Pro | $9/mo | $19/mo |
| Premium | $29/mo | $49/mo |

**Launch offer:** "Founding member pricing - 50% off for first 100 users"

---

## Competitor Price Comparison

| App | Free | Basic | Pro | Enterprise |
|-----|------|-------|-----|------------|
| **Cartboost** | ✅ $0 | - | $19 | $49 |
| Convert | ❌ | $49 | $99 | $299 |
| Neat | ❌ | $19 | $49 | $99 |
| Optimizely | ❌ | - | - | $500+ |
| ABly | ❌ | $29 | $79 | $199 |

**Our advantage:** Only app with true free tier + competitive paid tiers

---

## Revenue Projections

### Conservative

| Month | Users (Free) | Users (Pro) | Users (Premium) | MRR |
|-------|--------------|-------------|-----------------|-----|
| 1 | 20 | 2 | 1 | $87 |
| 2 | 50 | 5 | 2 | $197 |
| 3 | 100 | 10 | 5 | $495 |

### Optimistic

| Month | Users (Free) | Users (Pro) | Users (Premium) | MRR |
|-------|--------------|-------------|-----------------|-----|
| 1 | 50 | 5 | 2 | $197 |
| 2 | 150 | 15 | 8 | $687 |
| 3 | 300 | 30 | 15 | $1,485 |

---

## Pricing Page Elements

### Must Include

1. **Clear feature comparison table**
2. **"Most Popular" badge on Pro**
3. **Toggle for monthly/annual**
4. **Free forever badge**
5. **Money-back guarantee (30 days)**
6. **"No credit card required" for free**
7. **FAQ section**

### Visual Design

- Green for "included"
- Red for "not included"
- Checkmarks for features
- Bold pricing numbers
- Clear CTA buttons

---

## FAQ Examples

### "Is there a free trial?"

"Yes! Our free tier is free forever. No credit card required."

### "Can I cancel anytime?"

"Yes, cancel anytime. You keep access until your billing period ends."

### "What counts as a visitor?"

"Each unique visitor who sees your store counts. We track using cookies."

### "What happens if I exceed my limit?"

"We'll notify you before hitting the limit. Upgrade to continue testing."

---

## Implementation

### Stripe Integration

- Monthly billing
- Annual billing (20% discount)
- Failed payment retry logic
- Customer portal for self-service

### Affiliate Commission

| Tier | Commission |
|------|------------|
| Pro signup | $10 |
| Premium signup | $25 |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Free → Pro conversion | 5-10% |
| Annual vs monthly | 30% annual |
| Churn rate | <5%/month |
| LTV | $200+ |
