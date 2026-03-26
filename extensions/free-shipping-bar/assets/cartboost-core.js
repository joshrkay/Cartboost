/**
 * CartBoost Core — Pure logic functions for the free shipping bar.
 *
 * Extracted from the Liquid template so they can be unit-tested.
 * The Liquid file is a thin shell that reads settings, calls the API,
 * feeds config into these functions, and updates the DOM.
 */

// Cookie helpers
function getCookie(name) {
  var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, maxAgeDays) {
  var maxAge = (maxAgeDays || 30) * 86400;
  document.cookie = name + '=' + encodeURIComponent(value) +
    '; path=/; max-age=' + maxAge + '; SameSite=Lax';
}

/**
 * Return a persistent variant index for this visitor.
 * If a cookie already exists, reuse it. Otherwise, pick a random index and persist.
 *
 * @param {number} numVariants - Number of active variants
 * @param {string|null} existingCookie - Value of the cartboost_variant cookie (or null)
 * @returns {{ index: number, isNew: boolean }}
 */
function getOrAssignVariant(numVariants, existingCookie) {
  if (existingCookie !== null && existingCookie !== undefined) {
    var parsed = parseInt(existingCookie, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < numVariants) {
      return { index: parsed, isNew: false };
    }
  }
  var index = Math.floor(Math.random() * numVariants);
  return { index: index, isNew: true };
}

/**
 * Generate or retrieve a persistent visitor ID (UUID v4-like).
 *
 * @param {string|null} existingId - Value of the cartboost_vid cookie (or null)
 * @returns {{ id: string, isNew: boolean }}
 */
function getOrCreateVisitorId(existingId) {
  if (existingId && existingId.length >= 20) {
    return { id: existingId, isNew: false };
  }
  var id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  return { id: id, isNew: true };
}

/**
 * Compute the shipping bar message based on cart subtotal and threshold.
 *
 * @param {number} subtotal - Cart subtotal in dollars
 * @param {number} threshold - Free shipping threshold
 * @param {string} belowMessage - Message template with 'X' placeholder for remaining amount
 * @param {string} unlockedMessage - Message when threshold is met
 * @returns {string}
 */
function computeBarMessage(subtotal, threshold, belowMessage, unlockedMessage) {
  if (subtotal >= threshold) {
    return unlockedMessage;
  }
  var remaining = (threshold - subtotal).toFixed(2);
  return belowMessage.replace('X', remaining);
}

/**
 * Select the variant configuration (color + messages) based on tier and test mode.
 *
 * @param {string} tier - 'free', 'pro', or 'premium'
 * @param {string} testMode - 'same_message', 'random_message_random_color', or 'paired'
 * @param {object} variants - { colors: string[], belowMessages: string[], unlockedMessages: string[] }
 * @param {number} variantIndex - The assigned variant index
 * @param {string} defaultColor - Default bar background color
 * @param {string} defaultBelow - Default below-threshold message
 * @param {string} defaultUnlocked - Default unlocked message
 * @returns {{ bgColor: string, belowMessage: string, unlockedMessage: string }}
 */
function selectVariantConfig(tier, testMode, variants, variantIndex, defaultColor, defaultBelow, defaultUnlocked) {
  if (tier === 'free') {
    return {
      bgColor: defaultColor,
      belowMessage: defaultBelow,
      unlockedMessage: defaultUnlocked,
    };
  }

  var bgColor = defaultColor;
  var belowMessage = defaultBelow;
  var unlockedMessage = defaultUnlocked;
  var colors = variants.colors || [];
  var belowMessages = variants.belowMessages || [];
  var unlockedMessages = variants.unlockedMessages || [];

  if (testMode === 'same_message') {
    bgColor = colors[variantIndex] || defaultColor;
  } else if (testMode === 'random_message_random_color') {
    // Use variantIndex for deterministic per-visitor selection so each visitor
    // sees a consistent experience across page loads (required for valid A/B testing).
    bgColor = colors[variantIndex % colors.length] || defaultColor;
    belowMessage = belowMessages[variantIndex % belowMessages.length] || defaultBelow;
    unlockedMessage = unlockedMessages[variantIndex % unlockedMessages.length] || defaultUnlocked;
  } else if (testMode === 'paired') {
    bgColor = colors[variantIndex] || defaultColor;
    belowMessage = belowMessages[variantIndex] || defaultBelow;
    unlockedMessage = unlockedMessages[variantIndex] || defaultUnlocked;
  }

  return { bgColor: bgColor, belowMessage: belowMessage, unlockedMessage: unlockedMessage };
}

/**
 * Check whether a given event has already been sent for this visitor (client-side guard).
 *
 * @param {string} eventType - e.g. 'impression', 'add_to_cart'
 * @param {string} variantId - The variant being tracked
 * @param {object} sentEvents - Map of "eventType:variantId" => true
 * @returns {boolean} true if this event should be skipped (already sent)
 */
function shouldDeduplicateEvent(eventType, variantId, sentEvents) {
  var key = eventType + ':' + variantId;
  if (sentEvents[key]) {
    return true;
  }
  sentEvents[key] = true;
  return false;
}

/**
 * Compute progress bar percentage (0-100).
 *
 * @param {number} subtotal
 * @param {number} threshold
 * @returns {number}
 */
function computeProgressPercent(subtotal, threshold) {
  if (threshold <= 0) return 100;
  if (subtotal <= 0) return 0;
  if (subtotal >= threshold) return 100;
  return Math.round((subtotal / threshold) * 100);
}

/**
 * Select the correct threshold for the customer's active currency.
 *
 * @param {object} thresholds - Map of currency code to threshold (e.g. { USD: 50, EUR: 45 })
 * @param {string} activeCurrency - The customer's active currency code
 * @param {number} defaultThreshold - Fallback threshold
 * @returns {number}
 */
function selectThresholdForCurrency(thresholds, activeCurrency, defaultThreshold) {
  if (!thresholds || !activeCurrency) return defaultThreshold;
  var value = thresholds[activeCurrency];
  if (typeof value === 'number' && value > 0) return value;
  return defaultThreshold;
}

/**
 * Select a variant using server-provided weights (for auto-optimize mode).
 * Uses cumulative distribution for weighted random selection.
 *
 * @param {object} weights - Map of variantId → weight (summing to ~1.0)
 * @param {Array} variants - Array of { id, name } from server
 * @returns {{ index: number, variantId: string } | null}
 */
function selectWeightedVariant(weights, variants) {
  if (!weights || !variants || variants.length === 0) return null;

  var entries = [];
  for (var i = 0; i < variants.length; i++) {
    var w = weights[variants[i].id] || 0;
    entries.push({ index: i, id: variants[i].id, weight: w });
  }

  var totalWeight = 0;
  for (var j = 0; j < entries.length; j++) {
    totalWeight += entries[j].weight;
  }
  if (totalWeight === 0) return null;

  var r = Math.random() * totalWeight;
  var cumulative = 0;
  for (var k = 0; k < entries.length; k++) {
    cumulative += entries[k].weight;
    if (r <= cumulative) {
      return { index: entries[k].index, variantId: entries[k].id };
    }
  }

  // Fallback to last entry
  return { index: entries[entries.length - 1].index, variantId: entries[entries.length - 1].id };
}

/**
 * Detect the current device type using user-agent (primary) with
 * screen width as fallback. UA check prevents desktop users in narrow
 * browser windows from being misclassified as mobile.
 *
 * @returns {"mobile" | "desktop"}
 */
function detectDeviceType() {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      return 'mobile';
    }
    // Non-mobile UA detected — trust it over viewport width
    // (desktop users in narrow windows should not be classified as mobile)
    return 'desktop';
  }
  // No UA available (e.g. SSR) — fall back to viewport width
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Filter variants by device target.
 * Variants with deviceTarget "all" or undefined/missing are always included.
 *
 * @param {Array} variants - Array of { id, name, config: { deviceTarget?: string } }
 * @param {string} deviceType - "mobile" or "desktop"
 * @returns {Array} Filtered variants
 */
function filterVariantsByDevice(variants, deviceType) {
  if (!variants || !deviceType) return variants || [];
  return variants.filter(function(v) {
    var target = v.config && v.config.deviceTarget;
    return !target || target === 'all' || target === deviceType;
  });
}

// Expose functions on globalThis for both browser and test environments.
// In the browser, <script> function declarations are already global,
// but this makes them explicitly available in Node.js/Vitest ESM context too.
if (typeof globalThis !== 'undefined') {
  globalThis.__cartboostCore = {
    getOrAssignVariant: getOrAssignVariant,
    getOrCreateVisitorId: getOrCreateVisitorId,
    computeBarMessage: computeBarMessage,
    selectVariantConfig: selectVariantConfig,
    shouldDeduplicateEvent: shouldDeduplicateEvent,
    computeProgressPercent: computeProgressPercent,
    selectThresholdForCurrency: selectThresholdForCurrency,
    selectWeightedVariant: selectWeightedVariant,
    detectDeviceType: detectDeviceType,
    filterVariantsByDevice: filterVariantsByDevice,
    getCookie: getCookie,
    setCookie: setCookie,
  };
}
