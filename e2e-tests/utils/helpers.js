/**
 * Test utilities for E2E testing
 */

/**
 * Wait for a specific condition with timeout
 * @param {Function} condition - Function that returns true when condition is met
 * @param {Object} options - Options
 * @param {number} options.timeout - Timeout in ms (default: 5000)
 * @param {number} options.interval - Check interval in ms (default: 100)
 * @param {string} options.message - Error message if timeout
 */
async function waitFor(condition, options = {}) {
  const { timeout = 5000, interval = 100, message = 'Condition not met' } = options;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`${message} (timeout after ${timeout}ms)`);
}

/**
 * Generate a unique test user email
 */
function generateTestEmail() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test_${timestamp}_${random}@syncspeaker.test`;
}

/**
 * Generate a unique DJ name
 */
function generateDJName() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `DJ_Test_${random}`;
}

/**
 * Clear all browser storage
 * @param {import('@playwright/test').Page} page
 */
async function clearBrowserStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // Clear cookies
  const context = page.context();
  await context.clearCookies();
}

/**
 * Take a screenshot with a descriptive name
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function takeScreenshot(page, name) {
  const sanitizedName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${sanitizedName}_${timestamp}.png`;
  
  await page.screenshot({ 
    path: `e2e-tests/screenshots/${filename}`,
    fullPage: true 
  });
  
  return filename;
}

/**
 * Check if element is visible on page
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 */
async function isVisible(page, selector) {
  try {
    const element = await page.locator(selector);
    return await element.isVisible();
  } catch (error) {
    return false;
  }
}

/**
 * Wait for toast message and verify text
 * @param {import('@playwright/test').Page} page
 * @param {string} expectedText - Expected toast text (partial match)
 */
async function waitForToast(page, expectedText) {
  const toastLocator = page.locator('#toast');
  await toastLocator.waitFor({ state: 'visible', timeout: 5000 });
  const text = await toastLocator.textContent();
  return text.includes(expectedText);
}

/**
 * Wait for element to contain text
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {string} text
 */
async function waitForText(page, selector, text) {
  await page.locator(selector).filter({ hasText: text }).waitFor({ 
    state: 'visible',
    timeout: 5000 
  });
}

/**
 * Simulate a delay (for human-like interaction)
 * @param {number} ms
 */
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get test accounts configuration
 */
function getTestAccounts() {
  return {
    hostDJ: {
      email: generateTestEmail(),
      djName: generateDJName(),
      password: 'TestPass123!'
    },
    guest1: {
      email: generateTestEmail(),
      djName: generateDJName(),
      password: 'TestPass123!'
    },
    guest2: {
      email: generateTestEmail(),
      djName: generateDJName(),
      password: 'TestPass123!'
    }
  };
}

module.exports = {
  waitFor,
  generateTestEmail,
  generateDJName,
  clearBrowserStorage,
  takeScreenshot,
  isVisible,
  waitForToast,
  waitForText,
  delay,
  getTestAccounts
};
