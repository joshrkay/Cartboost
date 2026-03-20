import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { listExperiments, type ExperimentSummary } from "../models/analytics.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Badge,
  Text,
  EmptyState,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const experiments = await listExperiments(session.shop);
  const shopPlan = await db.shopPlan.findUnique({ where: { shop: session.shop } });
  const currentPlan = shopPlan?.plan ?? "free";
  return { experiments, currentPlan };
};

function statusBadgeTone(status: string) {
  switch (status) {
    case "active": return "success" as const;
    case "paused": return "warning" as const;
    case "completed": return "info" as const;
    default: return undefined;
  }
}

export default function ExperimentsList() {
  const { experiments } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (experiments.length === 0) {
    return (
      <Page title="Experiments" backAction={{ url: "/app" }}>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No experiments yet"
                image=""
                action={{ content: "Create First Experiment", url: "/app/experiments/new" }}
              >
                <p>Create your first A/B test to start optimizing your free shipping bar.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const resourceName = { singular: "experiment", plural: "experiments" };

  const rowMarkup = experiments.map(
    (exp: ExperimentSummary, index: number) => (
      <IndexTable.Row
        id={exp.id}
        key={exp.id}
        position={index}
        onClick={() => navigate(`/app/experiments/${exp.id}`)}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{exp.name}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={statusBadgeTone(exp.status)}>{exp.status}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={exp.mode === "auto_optimize" ? "magic" : undefined}>
            {exp.mode === "auto_optimize" ? "Auto" : "Manual"}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>{exp.variantCount}</IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(exp.createdAt).toLocaleDateString()}
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page
      title="Experiments"
      backAction={{ url: "/app" }}
      primaryAction={{ content: "New Experiment", url: "/app/experiments/new" }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={experiments.length}
              headings={[
                { title: "Name" },
                { title: "Status" },
                { title: "Mode" },
                { title: "Variants" },
                { title: "Created" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
