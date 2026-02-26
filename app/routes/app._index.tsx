import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { authenticate, PLAN_PRICES } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
    Page,
    Layout,
    Card,
    Text,
    Button,
    BlockStack,
    InlineStack,
    Select,
    IndexTable,
    Badge,
    Icon,
} from "@shopify/polaris";
import {
    PersonIcon,
    CartIcon,
    CheckIcon,
    ChartLineIcon,
    ClockIcon,
} from "@shopify/polaris-icons";
import { getOrCreateABTest, getABTestStats, computeDateRange, getDateRangeLabel, type VariantStat } from "../models/analytics.server";
import { DashboardEmptyState } from "../components/DashboardEmptyState";

import db from "../db.server";
import {
    logRequestError,
    redirectToLoginForEmbeddedShop,
    shouldRecoverFromResponseError,
} from "../utils/request-debug.server";

async function loadDashboardData(shop: string, request: Request, dateRangeKey: string) {
    let variants: VariantStat[] = [];
    let currentPlan = "free";

    try {
        const shopPlan = await db.shopPlan.findUnique({ where: { shop } });
        currentPlan = shopPlan?.plan ?? "free";
    } catch (error) {
        logRequestError("Dashboard data load failed", request, error, { shop });
    }

    try {
        const test = await getOrCreateABTest(shop);
        const dateRange = computeDateRange(dateRangeKey);
        variants = await getABTestStats(test.id, dateRange);
    } catch (error) {
        logRequestError("Dashboard data load failed", request, error, { shop });
    }

    return { variants, currentPlan };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    try {
        const { session } = await authenticate.admin(request);
        const shop = session.shop;
        const url = new URL(request.url);
        const dateRangeKey = url.searchParams.get("dateRange") || "last7";
        const { variants, currentPlan } = await loadDashboardData(shop, request, dateRangeKey);
        const dateRangeLabel = getDateRangeLabel(dateRangeKey);
        return { shop, variants, currentPlan, prices: PLAN_PRICES, dateRange: dateRangeKey, dateRangeLabel };
    } catch (error) {
        if (shouldRecoverFromResponseError(error) || !(error instanceof Response)) {
            logRequestError("Dashboard loader authentication failed", request, error);
            const loginRedirect = redirectToLoginForEmbeddedShop(request);
            if (loginRedirect) throw loginRedirect;
        }

        throw error;
    }
};

export default function Index() {
    const { shop, variants, currentPlan, prices, dateRange, dateRangeLabel } = useLoaderData<typeof loader>();
    const formatPrice = (plan: "pro" | "premium") => `$${prices[plan].amount}/mo`;
    const navigate = useNavigate();
    const fetcher = useFetcher();

  if (variants.length === 0) {
    return <DashboardEmptyState />;
  }

  const totalVisitors = variants.reduce((sum, v) => sum + v.visitors, 0);
    const totalConversions = variants.reduce((sum, v) => sum + v.conversions, 0);
    const avgCR = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
    const bestLift = variants.length > 0 ? Math.max(...variants.map(v => v.lift)) : 0;
    const leadingVariant = totalVisitors > 0
        ? variants.reduce((best, v) => (v.lift > best.lift ? v : best), variants[0])
        : null;

  const handleUpgrade = (plan: string) => {
        fetcher.submit({ plan }, { method: "post", action: "/app/billing" });
  };

  const resourceName = { singular: 'variant', plural: 'variants' };

  const rowMarkup = variants.map(
        ({ id, variant, visitors, conversions, conversionRate, lift, confidence, status }: VariantStat, index: number) => (
                <IndexTable.Row id={id} key={id} position={index}>
                          <IndexTable.Cell>
                                    <Badge tone={
                                      status === "Winning" || status === "Promising" ? "success" :
                                      status === "Losing" ? "critical" :
                                      status === "Underperforming" ? "warning" :
                                      "info"
                                    }>
                                      {status}
                                    </Badge>
                          </IndexTable.Cell>
                        <IndexTable.Cell>
                                  <Text variant="bodyMd" fontWeight="bold" as="span">
                                    {variant === "A" ? "Original (Control)" : `Variation ${variant}`}
                                  </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{visitors.toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>{conversions.toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>{conversionRate}%</IndexTable.Cell>
                        <IndexTable.Cell>
                                  <Text tone={lift > 0 ? "success" : lift < 0 ? "critical" : undefined} fontWeight="bold" as="span">
                                    {lift > 0 ? `+${lift}%` : `${lift}%`}
                                  </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                              <Text as="span">{confidence}%</Text>
                                    {confidence >= 95 && <Icon source={CheckIcon} tone="success" />}
                                  </div>
                        </IndexTable.Cell>
                </IndexTable.Row>
              ),
      );
  
    return (
          <Page title="CartBoost A/B Analytics" subtitle="Optimize your conversion rates with real-time data experiments.">
                <Layout>
                        <Layout.Section>
                                  <InlineStack align="space-between">
                                              <div />
                                              <Select
                                                              label="Date Range"
                                                              labelInline
                                                              value={dateRange}
                                                              onChange={(value) => navigate(`/app?dateRange=${value}`)}
                                                              options={[
                                                                { label: "Last 7 days", value: "last7" },
                                                                { label: "This week", value: "thisWeek" },
                                                                { label: "This month", value: "thisMonth" },
                                                                { label: "Last 30 days", value: "last30" },
                                                                              ]}
                                                            />
                                  </InlineStack>
                        </Layout.Section>
                
                        <Layout.Section>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                              <Card>
                                                            <BlockStack gap="200">
                                                                            <InlineStack align="space-between">
                                                                                              <Text variant="headingSm" as="h3" tone="subdued">Total Visitors</Text>
                                                                                              <Icon source={PersonIcon} tone="subdued" />
                                                                            </InlineStack>
                                                                            <Text variant="headingLg" as="p">{totalVisitors.toLocaleString()}</Text>
                                                                            <Text variant="bodySm" tone="subdued" as="p">{dateRangeLabel}</Text>
                                                            </BlockStack>
                                              </Card>
                                              <Card>
                                                            <BlockStack gap="200">
                                                                            <InlineStack align="space-between">
                                                                                              <Text variant="headingSm" as="h3" tone="subdued">Total Conversions</Text>
                                                                                              <Icon source={CartIcon} tone="subdued" />
                                                                            </InlineStack>
                                                                            <Text variant="headingLg" as="p">{totalConversions.toLocaleString()}</Text>
                                                                            <Text variant="bodySm" tone="subdued" as="p">{dateRangeLabel}</Text>
                                                            </BlockStack>
                                              </Card>
                                              <Card>
                                                            <BlockStack gap="200">
                                                                            <InlineStack align="space-between">
                                                                                              <Text variant="headingSm" as="h3" tone="subdued">Avg. Conv. Rate</Text>
                                                                                              <Icon source={ChartLineIcon} tone="subdued" />
                                                                            </InlineStack>
                                                                            <Text variant="headingLg" as="p">{avgCR.toFixed(2)}%</Text>
                                                                            <Text variant="bodySm" tone="subdued" as="p">Across all variants</Text>
                                                            </BlockStack>
                                              </Card>
                                              <Card>
                                                            <BlockStack gap="200">
                                                                            <InlineStack align="space-between">
                                                                                              <Text variant="headingSm" as="h3" tone="subdued">Peak Performance</Text>
                                                                                              <Icon source={CheckIcon} tone="success" />
                                                                            </InlineStack>
                                                                            <Text variant="headingLg" as="p" tone="success">+{bestLift}% Lift</Text>
                                                                            <Text variant="bodySm" tone="subdued" as="p">
                                                                              {leadingVariant
                                                                                ? `Variation ${leadingVariant.variant} is leading`
                                                                                : "No data yet"}
                                                                            </Text>
                                                            </BlockStack>
                                              </Card>
                                  </div>
                        </Layout.Section>
                
                        <Layout.Section>
                                  <Card padding="0">
                                              <IndexTable
                                                              resourceName={resourceName}
                                                              itemCount={variants.length}
                                                              headings={[
                                                                { title: 'Status' },
                                                                { title: 'Variation' },
                                                                { title: 'Visitors' },
                                                                { title: 'Purchases' },
                                                                { title: 'Conv. Rate' },
                                                                { title: 'Performance Lift' },
                                                                { title: 'Confidence' },
                                                                              ]}
                                                              selectable={false}
                                                            >
                                                {rowMarkup}
                                              </IndexTable>
                                  </Card>
                        </Layout.Section>
                
                        <Layout.Section variant="oneThird">
                                  <BlockStack gap="500">
                                              <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  {currentPlan === "free" ? "Go Live & Upgrade" : "Your Plan"}
                </Text>
                {currentPlan === "free" ? (
                  <>
                    <Text as="p">Choose Pro or Premium to unlock full A/B testing and advanced reporting.</Text>
                    <BlockStack gap="200">
                      <Button variant="primary" onClick={() => handleUpgrade("pro")} fullWidth>
                        {`Upgrade to Pro — ${formatPrice("pro")}`}
                      </Button>
                      <Button variant="primary" onClick={() => handleUpgrade("premium")} fullWidth>
                        {`Upgrade to Premium — ${formatPrice("premium")}`}
                      </Button>
                    </BlockStack>
                  </>
                ) : (
                  <BlockStack gap="200">
                    <Badge tone="success">
                      {currentPlan === "premium" ? `Premium Plan — ${formatPrice("premium")}` : `Pro Plan — ${formatPrice("pro")}`}
                    </Badge>
                    <Text as="p" tone="subdued">
                      {currentPlan === "pro"
                        ? "Upgrade to Premium for advanced analytics and unlimited variants."
                        : "You have access to all CartBoost features."}
                    </Text>
                    {currentPlan === "pro" && (
                      <Button variant="plain" onClick={() => handleUpgrade("premium")}>
                        {`Upgrade to Premium — ${formatPrice("premium")}`}
                      </Button>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
                                              <Card>
                                                            <BlockStack gap="400">
                                                                            <Text variant="headingMd" as="h2">Quick Actions</Text>
                                                                            <Button
                                                                                                url={`https://${shop}/admin/themes/current/editor`}
                                                                                                target="_blank"
                                                                                                variant="primary"
                                                                                                fullWidth
                                                                                              >
                                                                                              Edit Theme Bar
                                                                            </Button>
                                                                            <Button variant="plain" icon={ClockIcon}>View Test History</Button>
                                                            </BlockStack>
                                              </Card>
                                  </BlockStack>
                        </Layout.Section>
                </Layout>
          </Page>
        );
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};
