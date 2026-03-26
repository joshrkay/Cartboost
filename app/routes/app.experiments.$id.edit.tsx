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
  Select,
} from "@shopify/polaris";
import { useState } from "react";

interface VariantData {
  id: string;
  name: string;
  config: { color?: string; text?: string; deviceTarget?: string };
}

const COMMON_CURRENCIES = [
  { label: "USD - US Dollar", value: "USD" },
  { label: "EUR - Euro", value: "EUR" },
  { label: "GBP - British Pound", value: "GBP" },
  { label: "CAD - Canadian Dollar", value: "CAD" },
  { label: "AUD - Australian Dollar", value: "AUD" },
  { label: "JPY - Japanese Yen", value: "JPY" },
];

const DEVICE_OPTIONS = [
  { label: "All Devices", value: "all" },
  { label: "Mobile Only", value: "mobile" },
  { label: "Desktop Only", value: "desktop" },
];

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

  const shopPlan = await db.shopPlan.findUnique({ where: { shop: session.shop } });
  const plan = shopPlan?.plan ?? "free";

  return {
    plan,
    test: {
      id: test.id,
      name: test.name,
      description: test.description ?? "",
      status: test.status,
      startAt: test.startAt?.toISOString() ?? null,
      endAt: test.endAt?.toISOString() ?? null,
      currencyThresholds: test.currencyThresholds as Record<string, number> | null,
    },
    variants: test.variants.map((v) => ({
      id: v.id,
      name: v.name,
      config: v.config as { color?: string; text?: string; deviceTarget?: string },
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

  // Parse currency thresholds
  const currencyThresholdsRaw = formData.get("currencyThresholds") as string;
  let currencyThresholds: Record<string, number> | null = null;
  if (currencyThresholdsRaw) {
    try {
      const parsed = JSON.parse(currencyThresholdsRaw);
      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0) {
        currencyThresholds = parsed;
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  // Parse scheduled dates
  const startAtRaw = formData.get("startAt") as string;
  const endAtRaw = formData.get("endAt") as string;
  const startAt = startAtRaw ? new Date(startAtRaw) : undefined;
  const endAt = endAtRaw ? new Date(endAtRaw) : undefined;

  await updateExperiment(testId, {
    name: name.trim(),
    description: description?.trim() || undefined,
    currencyThresholds,
  });

  // Update scheduling if test is scheduled
  if (test.status === "scheduled" && (startAt || endAt)) {
    await db.aBTest.update({
      where: { id: testId },
      data: {
        ...(startAt ? { startAt } : {}),
        ...(endAt ? { endAt } : {}),
      },
    });
  }

  // Update variant configs
  const variantIds = formData.getAll("variantId") as string[];
  for (const variantId of variantIds) {
    const color = formData.get(`color_${variantId}`) as string;
    const text = formData.get(`text_${variantId}`) as string;
    const deviceTarget = formData.get(`deviceTarget_${variantId}`) as string;
    if (color || text) {
      await updateVariantConfig(variantId, {
        color: color || "#4CAF50",
        text: text || "",
        ...(deviceTarget && deviceTarget !== "all" ? { deviceTarget } : {}),
      });
    }
  }

  return redirect(`/app/experiments/${testId}`);
};

export default function EditExperiment() {
  const { test, variants, plan } = useLoaderData<typeof loader>();
  const [name, setName] = useState(test.name);
  const [description, setDescription] = useState(test.description);
  const [variantConfigs, setVariantConfigs] = useState<Record<string, { color: string; text: string; deviceTarget: string }>>(
    Object.fromEntries(
      variants.map((v: VariantData) => [
        v.id,
        {
          color: v.config.color ?? "#4CAF50",
          text: v.config.text ?? "",
          deviceTarget: v.config.deviceTarget ?? "all",
        },
      ]),
    ),
  );

  const initCurrencyRows = test.currencyThresholds
    ? Object.entries(test.currencyThresholds).map(([currency, threshold]) => ({
        currency,
        threshold: String(threshold),
      }))
    : [];
  const [currencyRows, setCurrencyRows] = useState(initCurrencyRows);

  const toLocalDatetime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toISOString().slice(0, 16);
  };
  const [startAt, setStartAt] = useState(toLocalDatetime(test.startAt));
  const [endAt, setEndAt] = useState(toLocalDatetime(test.endAt));

  const updateVariant = (id: string, field: "color" | "text" | "deviceTarget", value: string) => {
    setVariantConfigs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const addCurrencyRow = () => {
    setCurrencyRows([...currencyRows, { currency: "USD", threshold: "" }]);
  };

  const removeCurrencyRow = (index: number) => {
    setCurrencyRows(currencyRows.filter((_, i) => i !== index));
  };

  const updateCurrencyRow = (index: number, field: "currency" | "threshold", value: string) => {
    setCurrencyRows(currencyRows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const currencyThresholdsJson = currencyRows.length > 0
    ? JSON.stringify(
        Object.fromEntries(
          currencyRows
            .filter((r) => r.threshold && Number(r.threshold) > 0)
            .map((r) => [r.currency, Number(r.threshold)]),
        ),
      )
    : "";

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
                        {plan === "premium" && (
                          <div style={{ flex: "0 0 160px" }}>
                            <Select
                              label="Device Target"
                              name={`deviceTarget_${v.id}`}
                              options={DEVICE_OPTIONS}
                              value={variantConfigs[v.id]?.deviceTarget ?? "all"}
                              onChange={(value) => updateVariant(v.id, "deviceTarget", value)}
                            />
                          </div>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>

          {plan !== "free" && test.status === "scheduled" && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Schedule</Text>
                  <InlineStack gap="400" wrap>
                    <div style={{ flex: 1 }}>
                      <label>
                        <Text variant="bodySm" as="span">Start Date</Text>
                        <input
                          type="datetime-local"
                          name="startAt"
                          value={startAt}
                          onChange={(e) => setStartAt(e.target.value)}
                          style={{ display: "block", width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc", marginTop: 4 }}
                        />
                      </label>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>
                        <Text variant="bodySm" as="span">End Date</Text>
                        <input
                          type="datetime-local"
                          name="endAt"
                          value={endAt}
                          onChange={(e) => setEndAt(e.target.value)}
                          style={{ display: "block", width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc", marginTop: 4 }}
                        />
                      </label>
                    </div>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {plan !== "free" && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">Currency Thresholds</Text>
                    <Button onClick={addCurrencyRow} size="slim">Add Currency</Button>
                  </InlineStack>
                  {currencyRows.map((row, index) => (
                    <InlineStack key={index} gap="300" blockAlign="end">
                      <div style={{ flex: "0 0 200px" }}>
                        <Select
                          label="Currency"
                          options={COMMON_CURRENCIES}
                          value={row.currency}
                          onChange={(value) => updateCurrencyRow(index, "currency", value)}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Threshold"
                          type="number"
                          value={row.threshold}
                          onChange={(value) => updateCurrencyRow(index, "threshold", value)}
                          placeholder="e.g. 50"
                          autoComplete="off"
                        />
                      </div>
                      <Button tone="critical" variant="plain" onClick={() => removeCurrencyRow(index)} size="slim">
                        Remove
                      </Button>
                    </InlineStack>
                  ))}
                  <input type="hidden" name="currencyThresholds" value={currencyThresholdsJson} />
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

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
