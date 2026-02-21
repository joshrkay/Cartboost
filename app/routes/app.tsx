import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  AppProvider,
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const metrics = {
    installs: 1,
    aovLift: 15,
    proSubscribers: 0,
    premiumSubscribers: 0,
  };

  return json({
    shop: session.shop,
    metrics,
  });
};

export default function App() {
  const { shop, metrics } = useLoaderData();
  const app = useAppBridge();

  useEffect(() => {
    app.postMessage({
      type: "APP_BRIDGE_READY",
    });
  }, [app]);

  const handleUpgrade = (plan) => {
    window.open(`https://admin.shopify.com/store/${shop}/apps/324811030529/billing?plan=${plan}`, "_blank");
  };

  return (
    <AppProvider i18n={{}}>
      <Page title="CartBoost Free Shipping Bar">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Welcome to CartBoost for {shop}</Text>
                <Text>Boost your AOV with beautiful free shipping bars.</Text>
                <Button url={`https://${shop}/admin/themes/current/editor`} target="_blank" primary>
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
                <Text variant="headingMd" as="h2">Go Live</Text>
                <Text>Upgrade to unlock full features.</Text>
                <InlineStack gap="400">
                  <Button primary onClick={() => handleUpgrade("pro")}>
                    Upgrade to Pro - $7.99/mo
                  </Button>
                  <Button primary onClick={() => handleUpgrade("premium")}>
                    Upgrade to Premium - $10.99/mo
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}