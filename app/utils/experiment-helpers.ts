export const COMMON_CURRENCIES = [
  { label: "USD - US Dollar", value: "USD" },
  { label: "EUR - Euro", value: "EUR" },
  { label: "GBP - British Pound", value: "GBP" },
  { label: "CAD - Canadian Dollar", value: "CAD" },
  { label: "AUD - Australian Dollar", value: "AUD" },
  { label: "JPY - Japanese Yen", value: "JPY" },
];

export const DEVICE_OPTIONS = [
  { label: "All Devices", value: "all" },
  { label: "Mobile Only", value: "mobile" },
  { label: "Desktop Only", value: "desktop" },
];

/**
 * Parse a date string from form input, returning undefined for empty or invalid values.
 */
export function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * Validate currency thresholds from either a JSON string (form data) or
 * an already-parsed value (Prisma Json field). Returns null if invalid or empty.
 * Only keeps entries where the value is a positive number.
 */
export function validateCurrencyThresholds(raw: string | unknown | null): Record<string, number> | null {
  if (!raw) return null;
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    parsed = raw;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof val === "number" && val > 0) {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
