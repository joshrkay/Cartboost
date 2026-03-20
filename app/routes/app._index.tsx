import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, useNavigate, isRouteErrorResponse, useRouteError } from "react-router";
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
  Banner,
  ButtonGroup,
} from "@shopify/polaris";
import {
  PersonIcon,
  CartIcon,
  CheckIcon,
  ChartLineIcon,
  ClockIcon,
  CashDollarIcon,
} from "@shopify/polaris-icons";
import {
  getOrCreateABTest,
  getABTestStats,
  computeDateRange,
  getDateRangeLabel,
  updateTestMode,
  type VariantStat,
} from "../models/analytics.server";
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
  let testId: string | null = null;
  let testName: string | null = null;
  let testMode = "manual";

  try {
    const shopPlan = await db.shopPlan.findUnique({ where: { shop } });
    currentPlan = shopPlan?.plan ?? "free";
  } catch (error) {
    logRequestError("Dashboard data load failed", request, error, { shop });
  }

  try {
    const test = await getOrCreateABTest(shop);
    testId = test.id;
    testName = test.name;
    testMode = test.mode;
    const dateRange = computeDateRange(dateRangeKey);
    variants = await getABTestStats(test, dateRange);
  } catch (error) {
    logRequestError("Dashboard data load failed", request, error, { shop });
  }

  return { variants, currentPlan, testId, testName, testMode };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const url = new URL(request.url);
    const dateRangeKey = url.searchParams.get("dateRange") || "last7";
    const { variants, currentPlan, testId, testName, testMode } = await loadDashboardData(shop, request, dateRangeKey);
    const dateRangeLabel = getDateRangeLabel(dateRangeKey);
    return { shop, variants, currentPlan, prices: PLAN_PRICES, dateRange: dateRangeKey, dateRangeLabel, testId, testName, testMode };
  } catch (error) {
    if (shouldRecoverFromResponseError(error) || !(error instanceof Response)) {
      logRequestError("Dashboard loader authentication failed", request, error);
      const loginRedirect = redirectToLoginForEmbeddedShop(request);
      if (loginRedirect) throw loginRedirect;
    }

    throw error;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "toggleMode") {
    const testId = formData.get("testId") as string;
    const mode = formData.get("mode") as "manual" | "auto_optimize";
    if (testId && (mode === "manual" || mode === "auto_optimize")) {
      await updateTestMode(testId, mode);
    }
    return { ok: true };
  }

  return { ok: false };
};

export default function Index() {
  const { shop, variants, currentPlan, prices, dateRange, dateRangeLabel, testId, testName, testMode } = useLoaderData<typeof loader>();
  const formatPrice = (plan: "pro" | "premium") => `$${prices[plan].amount}/mo`;
  const navigate = useNavigate();
  const fetcher = useFetcher();

  if (variants.length === 0) {
    return <DashboardEmptyState />;
  }

  const totalVisitors = variants.reduce((sum, v) => sum + v.visitors, 0);
  const totalConversions = variants.reduce((sum, v) => sum + v.conversions, 0);
  const totalRevenue = variants.reduce((sum, v) => sum + v.revenue, 0);
  const avgCR = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
  const bestLift = variants.length > 0 ? Math.max(...variants.map(v => v.lift)) : 0;
  const leadingVariant = totalVisitors > 0
    ? variants.reduce((best, v) => (v.lift > best.lift ? v : best), variants[0])
    : null;

  const handleUpgrade = (plan: string) => {
    fetcher.submit({ plan }, { method: "post", action: "/app/billing" });
  };

  const handleModeToggle = () => {
    if (!testId) return;
    const newMode = testMode === "manual" ? "auto_optimize" : "manual";
    fetcher.submit(
      { intent: "toggleMode", testId, mode: newMode },
      { method: "post" },
    );
  };

  const resourceName = { singular: 'variant', plural: 'variants' };

  const rowMarkup = variants.map(
    ({ id, variant, visitors, conversions, conversionRate, lift, confidence, status, orders, revenue }: VariantStat, index: number) => (
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
        <IndexTable.Cell>{orders}</IndexTable.Cell>
        <IndexTable.Cell>${revenue.toLocaleString()}</IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page title="CartBoost A/B Analytics" subtitle={testName ? `Active: ${testName}` : "Optimize your conversion rates with real-time data experiments."}>
      <Layout>
        {/* Mode toggle for Pro/Premium */}
        {currentPlan !== "free" && testId && (
          <Layout.Section>
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Optimization Mode</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    {testMode === "auto_optimize"
                      ? "Auto-optimize is active — traffic is automatically shifted to winning variants."
                      : "Manual mode — traffic is split evenly. Switch to auto-optimize to let CartBoost maximize conversions."}
                  </Text>
                </BlockStack>
                <ButtonGroup>
                  <Button
                    variant={testMode === "manual" ? "primary" : "secondary"}
                    onClick={testMode !== "manual" ? handleModeToggle : undefined}
                    size="slim"
                  >
                    Manual
                  </Button>
                  <Button
                    variant={testMode === "auto_optimize" ? "primary" : "secondary"}
                    onClick={testMode !== "auto_optimize" ? handleModeToggle : undefined}
                    size="slim"
                  >
                    Auto-Optimize
                  </Button>
                </ButtonGroup>
              </InlineStack>
            </Card>
          </Layout.Section>
        )}

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
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
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Total Revenue</Text>
                  <Icon source={CashDollarIcon} tone="subdued" />
                </InlineStack>
                <Text variant="headingLg" as="p">${totalRevenue.toLocaleString()}</Text>
                <Text variant="bodySm" tone="subdued" as="p">{dateRangeLabel}</Text>
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
                { title: 'Orders' },
                { title: 'Revenue' },
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
                <Button variant="plain" icon={ClockIcon} url="/app/experiments">
                  Manage Experiments
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred";

  return (
    <Page title="CartBoost A/B Analytics">
      <Layout>
        <Layout.Section>
          <Banner tone="critical" title="Something went wrong">
            <p>{message}</p>
            <p>Please refresh the page or try again later.</p>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
