import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getABTestStats,
  computeDateRange,
  changeTestStatus,
  deleteExperiment,
  type VariantStat,
} from "../models/analytics.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Badge,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Icon,
  Select,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const testId = params.id!;
  const test = await db.aBTest.findUnique({
    where: { id: testId },
    include: { variants: true },
  });

  if (!test || test.shop !== session.shop) {
    throw new Response("Experiment not found", { status: 404 });
  }

  const url = new URL(request.url);
  const dateRangeKey = url.searchParams.get("dateRange") || "last7";
  const dateRange = computeDateRange(dateRangeKey);
  const variants = await getABTestStats(test, dateRange);
  return {
    test: {
      id: test.id,
      name: test.name,
      description: test.description,
      status: test.status,
      mode: test.mode,
      createdAt: test.createdAt.toISOString(),
      completedAt: test.completedAt?.toISOString() ?? null,
      startAt: test.startAt?.toISOString() ?? null,
      endAt: test.endAt?.toISOString() ?? null,
    },
    variants,
    dateRange: dateRangeKey,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const testId = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const test = await db.aBTest.findUnique({ where: { id: testId } });
  if (!test || test.shop !== session.shop) {
    throw new Response("Experiment not found", { status: 404 });
  }

  if (intent === "changeStatus") {
    const newStatus = formData.get("status") as "active" | "paused" | "completed";
    await changeTestStatus(testId, newStatus, session.shop);
    return { ok: true };
  }

  if (intent === "delete") {
    await deleteExperiment(testId);
    return redirect("/app/experiments");
  }

  return { ok: false };
};

export default function ExperimentDetail() {
  const { test, variants, dateRange } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const totalRevenue = variants.reduce((sum: number, v: VariantStat) => sum + v.revenue, 0);
  const resourceName = { singular: "variant", plural: "variants" };

  const handleStatusChange = (status: string) => {
    fetcher.submit({ intent: "changeStatus", status }, { method: "post" });
  };

  const handleDelete = () => {
    fetcher.submit({ intent: "delete" }, { method: "post" });
  };

  const statusActions = [];
  if (test.status === "active") {
    statusActions.push(
      { content: "Pause", onAction: () => handleStatusChange("paused") },
      { content: "Complete", onAction: () => handleStatusChange("completed"), destructive: true },
    );
  } else if (test.status === "paused") {
    statusActions.push(
      { content: "Resume", onAction: () => handleStatusChange("active") },
      { content: "Complete", onAction: () => handleStatusChange("completed"), destructive: true },
    );
  } else if (test.status === "scheduled") {
    statusActions.push(
      { content: "Activate Now", onAction: () => handleStatusChange("active") },
      { content: "Cancel", onAction: () => handleStatusChange("completed"), destructive: true },
    );
  }

  const rowMarkup = variants.map(
    (v: VariantStat, index: number) => (
      <IndexTable.Row id={v.id} key={v.id} position={index}>
        <IndexTable.Cell>
          <Badge tone={
            v.status === "Winning" || v.status === "Promising" ? "success" :
            v.status === "Losing" ? "critical" :
            v.status === "Underperforming" ? "warning" :
            "info"
          }>
            {v.status}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center">
            <div style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: v.color, flexShrink: 0 }} />
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {v.variant === "A" ? "Control" : `Variant ${v.variant}`}
            </Text>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{v.visitors.toLocaleString()}</IndexTable.Cell>
        <IndexTable.Cell>{v.conversions.toLocaleString()}</IndexTable.Cell>
        <IndexTable.Cell>{v.conversionRate}%</IndexTable.Cell>
        <IndexTable.Cell>
          <Text tone={v.lift > 0 ? "success" : v.lift < 0 ? "critical" : undefined} fontWeight="bold" as="span">
            {v.lift > 0 ? `+${v.lift}%` : `${v.lift}%`}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="100" blockAlign="center">
            <Text as="span">{v.confidence}%</Text>
            {v.confidence >= 95 && <Icon source={CheckIcon} tone="success" />}
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{v.orders}</IndexTable.Cell>
        <IndexTable.Cell>${v.revenue.toLocaleString()}</IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page
      title={test.name}
      subtitle={test.description || undefined}
      backAction={{ url: "/app/experiments" }}
      secondaryActions={[
        { content: "Edit", url: `/app/experiments/${test.id}/edit` },
        ...statusActions,
      ]}
      additionalMetadata={
        <InlineStack gap="200">
          <Badge tone={test.status === "active" ? "success" : test.status === "paused" ? "warning" : test.status === "scheduled" ? "attention" : "info"}>
            {test.status}
          </Badge>
          <Badge tone={test.mode === "auto_optimize" ? "magic" : undefined}>
            {test.mode === "auto_optimize" ? "Auto-Optimize" : "Manual"}
          </Badge>
          {test.startAt && (
            <Badge tone="info">
              {`Starts: ${new Date(test.startAt).toLocaleDateString()}`}
            </Badge>
          )}
          {test.endAt && (
            <Badge tone="info">
              {`Ends: ${new Date(test.endAt).toLocaleDateString()}`}
            </Badge>
          )}
        </InlineStack>
      }
    >
      <Layout>
        {totalRevenue > 0 && (
          <Layout.Section>
            <Banner tone="success" title={`Total revenue attributed: $${totalRevenue.toLocaleString()}`} />
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack align="end">
            <Select
              label="Date Range"
              labelInline
              value={dateRange}
              onChange={(value) => {
                window.location.href = `/app/experiments/${test.id}?dateRange=${value}`;
              }}
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
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={variants.length}
              headings={[
                { title: "Status" },
                { title: "Variant" },
                { title: "Visitors" },
                { title: "Conversions" },
                { title: "Conv. Rate" },
                { title: "Lift" },
                { title: "Confidence" },
                { title: "Orders" },
                { title: "Revenue" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>

        {test.status === "completed" && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">Danger Zone</Text>
                <Button tone="critical" onClick={handleDelete}>
                  Delete Experiment
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
