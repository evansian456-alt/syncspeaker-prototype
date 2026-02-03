const { test: base } = require('@playwright/test');

/**
 * Custom fixtures for multi-session testing
 * Provides separate browser contexts for Host, Guest1, and Guest2
 */
const test = base.extend({
  // Host DJ context
  hostContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  
  // Host DJ page
  hostPage: async ({ hostContext }, use) => {
    const page = await hostContext.newPage();
    await use(page);
    await page.close();
  },
  
  // Guest 1 context
  guest1Context: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  
  // Guest 1 page
  guest1Page: async ({ guest1Context }, use) => {
    const page = await guest1Context.newPage();
    await use(page);
    await page.close();
  },
  
  // Guest 2 context
  guest2Context: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },
  
  // Guest 2 page
  guest2Page: async ({ guest2Context }, use) => {
    const page = await guest2Context.newPage();
    await use(page);
    await page.close();
  },
});

module.exports = { test };
