import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Select,
  Box,
} from "@shopify/polaris";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();
  const [dateRange, setDateRange] = useState("last7");

  // Mock A/B data (replace with real GraphQL later)
  const abData = [
    { variant: "A", color: "Green", lift: 12.3, addToCarts: 28, status: "Good" },
    { variant: "B", color: "Blue", lift: 18.7, addToCarts: 47, status: "Best" },
    { variant: "C", color: "Orange", lift: 9.4, addToCarts: 21, status: "Average" },
  ];

  const handleUpgrade = (plan: string) => {
    window.open(`https://admin.shopify.com/store/${shop}/apps/324811030529/billing?plan=${plan}`, "_blank");
  };

  return (
    <Page title="CartBoost Free Shipping Bar">
      <Layout>
        <Layout.Section>
          <Banner title={`Welcome to CartBoost for ${shop}`} tone="success">
            Boost your AOV with beautiful free shipping bars and urgency tools.
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">A/B Test Performance</Text>
                <Select
                  label="Date Range"
                  labelInline
                  value={dateRange}
                  onChange={setDateRange}
                  options={[
                    { label: "Last 7 days", value: "last7" },
                    { label: "This week", value: "thisWeek" },
                    { label: "This month", value: "thisMonth" },
                    { label: "Last 30 days", value: "last30" },
                  ]}
                />
              </InlineStack>

              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                {abData.map((item, index) => (
                  <Card key={index} style={{ flex: "1", minWidth: "280px" }}>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h3">Variant {item.variant} ({item.color})</Text>
                      <Box paddingBlockStart="400">
                        <div style={{ height: "12px", background: "#e5e5e5", borderRadius: "999px", overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${item.lift}%`,
                              background: "#007bff",
                              borderRadius: "999px"
                            }}
                          />
                        </div>
                      </Box>
                      <InlineStack gap="400">
                        <Text variant="headingLg" as="h4">{item.lift}%</Text>
                        <Text as="p">Lift</Text>
                      </InlineStack>
                      <Text as="p">{item.addToCarts} add-to-carts • {item.status}</Text>
                    </BlockStack>
                  </Card>
                ))}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Go Live & Upgrade</Text>
              <Text as="p">Choose Pro or Premium to unlock full A/B testing and advanced reporting.</Text>
              <InlineStack gap="400">
                <Button variant="primary" onClick={() => handleUpgrade("pro")}>
                  Upgrade to Pro — $7.99/mo
                </Button>
                <Button variant="primary" onClick={() => handleUpgrade("premium")}>
                  Upgrade to Premium — $10.99/mo
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Quick Actions</Text>
              <Button
                url={`https://${shop}/admin/themes/current/editor`}
                target="_blank"
                variant="primary"
              >
                Customize Bar in Theme Editor
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
