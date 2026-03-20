import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { redirect, useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import { createExperiment, getActiveTest } from "../models/analytics.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";

const DEFAULT_VARIANTS = [
  { name: "A", color: "#4CAF50", text: "Free shipping over $50" },
  { name: "B", color: "#2196F3", text: "Limited Time: Free Shipping!" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const activeTest = await getActiveTest(session.shop);
  const shopPlan = await db.shopPlan.findUnique({ where: { shop: session.shop } });
  const plan = shopPlan?.plan ?? "free";
  const maxVariants = plan === "premium" ? 5 : plan === "pro" ? 3 : 2;
  return {
    shop: session.shop,
    hasActiveTest: !!activeTest,
    activeTestName: activeTest?.name ?? null,
    maxVariants,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name?.trim()) {
    return { error: "Experiment name is required" };
  }

  const variantNames = formData.getAll("variantName") as string[];
  const variantColors = formData.getAll("variantColor") as string[];
  const variantTexts = formData.getAll("variantText") as string[];

  const variants = variantNames.map((vName, i) => ({
    name: vName,
    config: {
      color: variantColors[i] || "#4CAF50",
      text: variantTexts[i] || "",
    },
  }));

  if (variants.length === 0) {
    return { error: "At least one variant is required" };
  }

  try {
    const test = await createExperiment(session.shop, {
      name: name.trim(),
      description: description?.trim() || undefined,
      variants,
    });
    return redirect(`/app/experiments/${test.id}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create experiment" };
  }
};

export default function NewExperiment() {
  const { hasActiveTest, activeTestName, maxVariants } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [variants, setVariants] = useState(DEFAULT_VARIANTS.map((v) => ({ ...v })));

  const addVariant = () => {
    if (variants.length >= maxVariants) return;
    const letter = String.fromCharCode(65 + variants.length);
    setVariants([...variants, { name: letter, color: "#666666", text: "" }]);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 1) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: "color" | "text", value: string) => {
    setVariants(variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  return (
    <Page title="Create New Experiment" backAction={{ url: "/app/experiments" }}>
      <Form method="post">
        <Layout>
          {hasActiveTest && (
            <Layout.Section>
              <Banner tone="warning" title="Active experiment exists">
                <p>
                  &quot;{activeTestName}&quot; is currently active. It will need to be paused or
                  completed before this new experiment can go live.
                </p>
              </Banner>
            </Layout.Section>
          )}

          {actionData && "error" in actionData && (
            <Layout.Section>
              <Banner tone="critical" title={actionData.error as string} />
            </Layout.Section>
          )}

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Experiment Name"
                  name="name"
                  value={name}
                  onChange={setName}
                  placeholder="e.g. Holiday Free Shipping Bar Test"
                  autoComplete="off"
                />
                <TextField
                  label="Description (optional)"
                  name="description"
                  value={description}
                  onChange={setDescription}
                  multiline={2}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Variants</Text>
                  {variants.length < maxVariants && (
                    <Button onClick={addVariant} size="slim">Add Variant</Button>
                  )}
                </InlineStack>

                {variants.map((v, index) => (
                  <Card key={v.name}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text variant="headingSm" as="h3">
                          {v.name === "A" ? "Control (A)" : `Variant ${v.name}`}
                        </Text>
                        {index > 0 && (
                          <Button
                            tone="critical"
                            variant="plain"
                            onClick={() => removeVariant(index)}
                            size="slim"
                          >
                            Remove
                          </Button>
                        )}
                      </InlineStack>
                      <input type="hidden" name="variantName" value={v.name} />
                      <InlineStack gap="400" wrap>
                        <div style={{ flex: "0 0 auto" }}>
                          <label>
                            <Text variant="bodySm" as="span">Color</Text>
                            <input
                              type="color"
                              name="variantColor"
                              value={v.color}
                              onChange={(e) => updateVariant(index, "color", e.target.value)}
                              style={{ display: "block", width: 48, height: 36, cursor: "pointer", border: "1px solid #ccc", borderRadius: 4 }}
                            />
                          </label>
                        </div>
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Bar Message"
                            name="variantText"
                            value={v.text}
                            onChange={(value) => updateVariant(index, "text", value)}
                            placeholder="e.g. Add X more for free shipping!"
                            autoComplete="off"
                          />
                        </div>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <InlineStack align="end" gap="200">
              <Button url="/app/experiments">Cancel</Button>
              <Button variant="primary" submit>Create Experiment</Button>
            </InlineStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
