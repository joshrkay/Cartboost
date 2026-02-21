import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";
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
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

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

export default function Index() {
  const { shop, metrics } = useLoaderData<typeof loader>();
  const app = useAppBridge();

  useEffect(() => {
    // Signal App Bridge is ready
    app.postMessage({ type: "APP_BRIDGE_READY" });
  }, [app]);

  const handleUpgrade = (plan: string) => {
    window.open(
      `https://admin.shopify.com/store/${shop}/apps/324811030529/billing?plan=${plan}`,
      "_blank"
    );
  };

  return (
    <Page title="CartBoost Free Shipping Bar">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Welcome to CartBoost for {shop}
              </Text>
              <Text as="p">Boost your AOV with beautiful free shipping bars.</Text>
              <Button
                url={`https://${shop}/admin/themes/current/editor`}
                target="_blank"
                variant="primary"
              >
                Open Theme Editor
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Metrics
              </Text>
              <InlineStack gap="400">
                <Card>
                  <Text variant="headingLg" as="h3">
                    {metrics.installs}
                  </Text>
                  <Text as="p">Installs</Text>
                </Card>
                <Card>
                  <Text variant="headingLg" as="h3">
                    {metrics.aovLift}%
                  </Text>
                  <Text as="p">AOV Lift</Text>
                </Card>
                <Card>
                  <Text variant="headingLg" as="h3">
                    {metrics.proSubscribers}
                  </Text>
                  <Text as="p">Pro Subscribers</Text>
                </Card>
                <Card>
                  <Text variant="headingLg" as="h3">
                    {metrics.premiumSubscribers}
                  </Text>
                  <Text as="p">Premium Subscribers</Text>
                </Card>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Go Live
              </Text>
              <Text as="p">Upgrade to unlock full features.</Text>
              <InlineStack gap="400">
                <Button variant="primary" onClick={() => handleUpgrade("pro")}>
                  Upgrade to Pro - $7.99/mo
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleUpgrade("premium")}
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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
