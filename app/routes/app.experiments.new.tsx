import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateABTest } from "../models/analytics.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  List,
  InlineStack,
  Badge,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const test = await getOrCreateABTest(session.shop);
  return {
    shop: session.shop,
    testName: test.name,
    variantCount: test.variants.length,
    variants: test.variants.map((v: { name: string; config: unknown }) => ({
      name: v.name,
      config: v.config as { color?: string; text?: string },
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app");
};

export default function NewExperiment() {
  const { shop, variantCount, variants } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Set Up Your Experiment"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Badge tone="success">Experiment Ready</Badge>
              <Text variant="headingLg" as="h2">
                Your A/B test is configured with {variantCount} variants
              </Text>
              <Text as="p" tone="subdued">
                CartBoost automatically splits your storefront visitors across these variants and tracks which one drives the most add-to-cart actions.
              </Text>
              <Card>
                <BlockStack gap="200">
                  {variants.map((v: { name: string; config: { color?: string; text?: string } }) => (
                    <InlineStack key={v.name} gap="300" align="start" blockAlign="center">
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "4px",
                          backgroundColor: v.config?.color ?? "#4CAF50",
                          flexShrink: 0,
                        }}
                      />
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="bold" as="span">
                          Variant {v.name}
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="span">
                          {v.config?.text ?? "Default message"}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Card>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Next Steps</Text>
                <List type="number">
                  <List.Item>
                    Open your theme editor and add the <Text fontWeight="bold" as="span">CB Free Shipping Bar</Text> block to your store
                  </List.Item>
                  <List.Item>
                    Customize the bar colors, threshold, and messages
                  </List.Item>
                  <List.Item>
                    Publish your theme — CartBoost starts tracking immediately
                  </List.Item>
                </List>
                <BlockStack gap="200">
                  <Button
                    url={`https://${shop}/admin/themes/current/editor`}
                    target="_blank"
                    variant="primary"
                    fullWidth
                  >
                    Open Theme Editor
                  </Button>
                  <Button url="/app" fullWidth>
                    Go to Dashboard
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">How it works</Text>
                <Text as="p" tone="subdued">
                  Each visitor is randomly assigned a variant and sees that same variant on every visit (via a cookie). CartBoost tracks impressions and add-to-cart events, then calculates statistical confidence so you know which variant truly performs best.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
