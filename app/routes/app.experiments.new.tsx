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
  Select,
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
    plan,
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
  const variantDeviceTargets = formData.getAll("variantDeviceTarget") as string[];

  const variants = variantNames.map((vName, i) => ({
    name: vName,
    config: {
      color: variantColors[i] || "#4CAF50",
      text: variantTexts[i] || "",
      ...(variantDeviceTargets[i] && variantDeviceTargets[i] !== "all"
        ? { deviceTarget: variantDeviceTargets[i] }
        : {}),
    },
  }));

  if (variants.length === 0) {
    return { error: "At least one variant is required" };
  }

  // Parse currency thresholds
  const currencyThresholdsRaw = formData.get("currencyThresholds") as string;
  let currencyThresholds: Record<string, number> | undefined;
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

  if (startAt && endAt && endAt <= startAt) {
    return { error: "End date must be after start date" };
  }

  try {
    const test = await createExperiment(session.shop, {
      name: name.trim(),
      description: description?.trim() || undefined,
      currencyThresholds,
      startAt,
      endAt,
      variants,
    });
    return redirect(`/app/experiments/${test.id}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create experiment" };
  }
};

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

export default function NewExperiment() {
  const { hasActiveTest, activeTestName, maxVariants, plan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [variants, setVariants] = useState(DEFAULT_VARIANTS.map((v) => ({ ...v, deviceTarget: "all" })));
  const [currencyRows, setCurrencyRows] = useState<{ currency: string; threshold: string }[]>([]);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const addVariant = () => {
    if (variants.length >= maxVariants) return;
    const letter = String.fromCharCode(65 + variants.length);
    setVariants([...variants, { name: letter, color: "#666666", text: "", deviceTarget: "all" }]);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 1) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: "color" | "text" | "deviceTarget", value: string) => {
    setVariants(variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
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
                        {plan === "premium" && (
                          <div style={{ flex: "0 0 160px" }}>
                            <Select
                              label="Device Target"
                              name="variantDeviceTarget"
                              options={DEVICE_OPTIONS}
                              value={v.deviceTarget}
                              onChange={(value) => updateVariant(index, "deviceTarget", value)}
                            />
                          </div>
                        )}
                        {plan !== "premium" && (
                          <input type="hidden" name="variantDeviceTarget" value="all" />
                        )}
                      </InlineStack>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>

          {plan !== "free" && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Schedule (Optional)</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Set start and end dates to automatically activate and complete this experiment.
                  </Text>
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
                    <Text variant="headingMd" as="h2">Currency Thresholds (Optional)</Text>
                    <Button onClick={addCurrencyRow} size="slim">Add Currency</Button>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Set different free shipping thresholds per currency. The default threshold from theme settings is used as fallback.
                  </Text>
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
              <Button url="/app/experiments">Cancel</Button>
              <Button variant="primary" submit>Create Experiment</Button>
            </InlineStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
