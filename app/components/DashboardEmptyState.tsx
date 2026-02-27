import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Box,
} from "@shopify/polaris";

export function DashboardEmptyState() {
  return (
    <Page title="CartBoost A/B Analytics">
      <Layout>
        <Layout.Section>
          <Card>
            <Box paddingBlock="800" paddingInline="400">
              <BlockStack gap="400" align="center" inlineAlign="center">
                <Text variant="headingXl" as="h1" alignment="center">
                  Stop guessing. Start testing.
                </Text>
                <Text
                  variant="bodyLg"
                  as="p"
                  alignment="center"
                  tone="subdued"
                >
                  Your shipping bar is just guessing. Create two variants right
                  now and let the data tell you which one makes money.
                </Text>
                <BlockStack gap="200" inlineAlign="center">
                  <Button variant="primary" size="large" url="/app/experiments/new">
                    Create First Experiment
                  </Button>
                  <Text variant="bodySm" as="p" tone="subdued" alignment="center">
                    Takes 2 minutes. No code.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
