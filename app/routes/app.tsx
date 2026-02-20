import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Link,
} from "@shopify/polaris";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Stubbed metrics - replace with real data later (GraphQL queries)
  const metrics = {
    installs: 1,
    aovLift: 15,
    proSubscribers: 0,
    premiumSubscribers: 0,
  };

  return {
    shop: session.shop,
    metrics,
  };
};

export default function App() {
  const { shop, metrics } = useLoaderData();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = (plan) => {
    setLoading(true);
    const billingUrl = `https://admin.shopify.com/store/${shop}/apps/324811030529/billing?plan=${plan}`;
    window.open(billingUrl, "_blank");
    setLoading(false);
  };

  return (
    <Page title="CartBoost Free Shipping Bar">
      <Layout>
        <Layout.Section>
          <Banner title={`Welcome to CartBoost for ${shop}`} tone="success">
            Your Free Shipping Bar is installed and ready to boost AOV.
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Overview</Text>
              <Text>Bar is live on your store. Customize it in the Theme Editor.</Text>
              <Button
                url={`https://${shop}/admin/themes/current/editor`}
                target="_blank"
                primary
              >
                Open Theme Editor
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Metrics</Text>
              <InlineStack gap="400">
                <Card>
                  <Text variant="headingLg" as="h3">{metrics.installs}</Text>
                  <Text>Installs</Text>
                </Card>
                <Card>
                  <Text variant="headingLg" as="h3">{metrics.aovLift}%</Text>
                  <Text>AOV Lift</Text>
                </Card>
                <Card>
                  <Text variant="headingLg" as="h3">{metrics.proSubscribers}</Text>
                  <Text>Pro Subscribers</Text>
                </Card>
                <Card>
                  <Text variant="headingLg" as="h3">{metrics.premiumSubscribers}</Text>
                  <Text>Premium Subscribers</Text>
                </Card>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Upgrade & Go Live</Text>
              <Text>Unlock Pro or Premium features to boost conversions.</Text>

              <InlineStack gap="400">
                <Button
                  primary
                  onClick={() => handleUpgrade('pro')}
                  loading={loading}
                >
                  Upgrade to Pro - $7.99/mo
                </Button>
                <Button
                  primary
                  onClick={() => handleUpgrade('premium')}
                  loading={loading}
                >
                  Upgrade to Premium - $10.99/mo
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}