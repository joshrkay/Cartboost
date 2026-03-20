import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, Form, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { updateExperiment, updateVariantConfig } from "../models/analytics.server";
import db from "../db.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  InlineStack,
} from "@shopify/polaris";
import { useState } from "react";

interface VariantData {
  id: string;
  name: string;
  config: { color?: string; text?: string };
}

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

  return {
    test: {
      id: test.id,
      name: test.name,
      description: test.description ?? "",
      status: test.status,
    },
    variants: test.variants.map((v) => ({
      id: v.id,
      name: v.name,
      config: v.config as { color?: string; text?: string },
    })),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const testId = params.id!;

  const test = await db.aBTest.findUnique({ where: { id: testId } });
  if (!test || test.shop !== session.shop) {
    throw new Response("Experiment not found", { status: 404 });
  }

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name?.trim()) {
    return { error: "Name is required" };
  }

  await updateExperiment(testId, {
    name: name.trim(),
    description: description?.trim() || undefined,
  });

  // Update variant configs
  const variantIds = formData.getAll("variantId") as string[];
  for (const variantId of variantIds) {
    const color = formData.get(`color_${variantId}`) as string;
    const text = formData.get(`text_${variantId}`) as string;
    if (color || text) {
      await updateVariantConfig(variantId, {
        color: color || "#4CAF50",
        text: text || "",
      });
    }
  }

  return redirect(`/app/experiments/${testId}`);
};

export default function EditExperiment() {
  const { test, variants } = useLoaderData<typeof loader>();
  const [name, setName] = useState(test.name);
  const [description, setDescription] = useState(test.description);
  const [variantConfigs, setVariantConfigs] = useState<Record<string, { color: string; text: string }>>(
    Object.fromEntries(
      variants.map((v: VariantData) => [v.id, { color: v.config.color ?? "#4CAF50", text: v.config.text ?? "" }]),
    ),
  );

  const updateVariant = (id: string, field: "color" | "text", value: string) => {
    setVariantConfigs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  return (
    <Page
      title={`Edit: ${test.name}`}
      backAction={{ url: `/app/experiments/${test.id}` }}
    >
      <Form method="post">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Experiment Name"
                  name="name"
                  value={name}
                  onChange={setName}
                  autoComplete="off"
                />
                <TextField
                  label="Description"
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
                <Text variant="headingMd" as="h2">Variants</Text>
                {variants.map((v: VariantData) => (
                  <Card key={v.id}>
                    <BlockStack gap="300">
                      <input type="hidden" name="variantId" value={v.id} />
                      <Text variant="headingSm" as="h3">
                        {v.name === "A" ? "Control (A)" : `Variant ${v.name}`}
                      </Text>
                      <InlineStack gap="400" wrap>
                        <div style={{ flex: "0 0 auto" }}>
                          <label>
                            <Text variant="bodySm" as="span">Color</Text>
                            <input
                              type="color"
                              name={`color_${v.id}`}
                              value={variantConfigs[v.id]?.color ?? "#4CAF50"}
                              onChange={(e) => updateVariant(v.id, "color", e.target.value)}
                              style={{ display: "block", width: 48, height: 36, cursor: "pointer", border: "1px solid #ccc", borderRadius: 4 }}
                            />
                          </label>
                        </div>
                        <div style={{ flex: 1 }}>
                          <TextField
                            label="Message"
                            name={`text_${v.id}`}
                            value={variantConfigs[v.id]?.text ?? ""}
                            onChange={(value) => updateVariant(v.id, "text", value)}
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
              <Button url={`/app/experiments/${test.id}`}>Cancel</Button>
              <Button variant="primary" submit>Save Changes</Button>
            </InlineStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
