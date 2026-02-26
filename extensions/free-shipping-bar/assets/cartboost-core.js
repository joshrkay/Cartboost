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
    bgColor = colors[Math.floor(Math.random() * colors.length)] || defaultColor;
    belowMessage = belowMessages[Math.floor(Math.random() * belowMessages.length)] || defaultBelow;
    unlockedMessage = unlockedMessages[Math.floor(Math.random() * unlockedMessages.length)] || defaultUnlocked;
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
    getCookie: getCookie,
    setCookie: setCookie,
  };
}
