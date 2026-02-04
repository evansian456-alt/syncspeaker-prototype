const { test, expect } = require('@playwright/test');

test.describe('New UX Flow - Landing, Tier Selection, and Account Creation', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear any existing storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('Flow A - Normal User: Landing → Free Tier → Account → Start/Join', async ({ page }) => {
    // Step 1: Verify landing page is displayed
    await expect(page.locator('#viewLanding h1')).toContainText('PHONE PARTY');
    await expect(page.locator('text=Turn multiple phones into one synced speaker system')).toBeVisible();
    
    // Verify all three information cards are visible
    await expect(page.locator('text=Turn multiple phones into one synced speaker system')).toBeVisible();
    await expect(page.locator('text=Host plays music, guests hear it together')).toBeVisible();
    await expect(page.locator('text=Perfect for parties, hangouts, and events')).toBeVisible();
    
    // Verify all three pricing tiers are displayed
    await expect(page.locator('#viewLanding text=FREE')).toBeVisible();
    await expect(page.locator('#viewLanding text=PARTY PASS')).toBeVisible();
    await expect(page.locator('#viewLanding text=PRO')).toBeVisible();
    
    // Step 2: Click on Free tier
    await page.click('button:has-text("Use Free Version")');
    
    // Step 3: Verify account creation page is displayed
    await expect(page.locator('#viewAccountCreation h1')).toContainText('Create Account / Log In');
    await expect(page.locator('#viewAccountCreation text=FREE MODE')).toBeVisible();
    await expect(page.locator('text=2 phones · Unlimited time · Basic features')).toBeVisible();
    
    // Verify account creation form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Create Account & Continue")')).toBeVisible();
    
    // Verify skip option is available
    await expect(page.locator('button:has-text("Skip Account – Prototype Mode")')).toBeVisible();
    
    // Step 4: Fill in account details (simulate account creation)
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.fill('input[placeholder="DJ Cool"]', 'TestDJ');
    
    // Step 5: Click Create Account
    await page.click('button:has-text("Create Account & Continue")');
    
    // Step 6: Verify we're on the Start/Join page
    await expect(page.locator('#viewHome h1')).toContainText('Play music together');
    await expect(page.locator('text=Start a party (Host)')).toBeVisible();
    await expect(page.locator('text=Join a party (Friend)')).toBeVisible();
  });

  test('Flow B - Prototype Mode: Landing → Free Tier → Skip → Start/Join', async ({ page }) => {
    // Step 1: Navigate from landing to tier selection
    await page.click('button:has-text("Use Free Version")');
    
    // Step 2: Verify account creation page
    await expect(page.locator('h1')).toContainText('Create Account / Log In');
    
    // Step 3: Click Skip Account
    await page.click('button:has-text("Skip Account – Prototype Mode")');
    
    // Step 4: Wait for toast message
    await expect(page.locator('text=Prototype mode activated - No account required')).toBeVisible({ timeout: 3000 });
    
    // Step 5: Verify we're on Start/Join page
    await expect(page.locator('h1')).toContainText('Play music together');
    await expect(page.locator('text=Start a party (Host)')).toBeVisible();
    
    // Step 6: Verify prototype mode ID was created
    const prototypeId = await page.evaluate(() => {
      return localStorage.getItem('syncSpeakerPrototypeId');
    });
    expect(prototypeId).toBeTruthy();
    expect(prototypeId).toContain('proto_');
  });

  test('Flow C - Party Pass: Landing → Party Pass Tier → Account Creation', async ({ page }) => {
    // Step 1: Click on Party Pass tier
    await page.click('button:has-text("Buy Party Pass")');
    
    // Step 2: Verify account creation page shows Party Pass tier
    await expect(page.locator('h1')).toContainText('Create Account / Log In');
    await expect(page.locator('text=PARTY PASS')).toBeVisible();
    await expect(page.locator('text=£2.99 · Up to 4 phones · 2 hours')).toBeVisible();
    
    // Step 3: Verify form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button:has-text("Create Account & Continue")')).toBeVisible();
  });

  test('Flow D - Skip with Paid Tier: Party Pass → Skip → Warning → Start/Join', async ({ page }) => {
    // Step 1: Select Party Pass tier
    await page.click('button:has-text("Buy Party Pass")');
    
    // Step 2: Verify Party Pass selected
    await expect(page.locator('text=PARTY PASS')).toBeVisible();
    await expect(page.locator('text=£2.99 · Up to 4 phones · 2 hours')).toBeVisible();
    
    // Step 3: Click Skip Account
    await page.click('button:has-text("Skip Account – Prototype Mode")');
    
    // Step 4: Verify warning is displayed
    await expect(page.locator('text=Upgrades require an account to activate')).toBeVisible({ timeout: 1000 });
    await expect(page.locator('text=You selected a paid tier, but skipped account creation')).toBeVisible();
    
    // Step 5: Wait for toast message and verify Start/Join page
    await expect(page.locator('text=Prototype mode activated - No account required')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#viewHome h1')).toContainText('Play music together');
  });

  test('Flow E - Pro Tier: Landing → Pro Tier → Account Creation', async ({ page }) => {
    // Step 1: Click on Pro tier
    await page.click('button:has-text("Go Pro Monthly")');
    
    // Step 2: Verify account creation page shows Pro tier
    await expect(page.locator('h1')).toContainText('Create Account / Log In');
    await expect(page.locator('text=PRO MONTHLY')).toBeVisible();
    await expect(page.locator('text=£9.99/month · 12+ phones · Full features')).toBeVisible();
  });

  test('Navigation: Back button from Account Creation to Landing', async ({ page }) => {
    // Step 1: Navigate to account creation
    await page.click('button:has-text("Use Free Version")');
    await expect(page.locator('h1')).toContainText('Create Account / Log In');
    
    // Step 2: Click Back to Plans
    await page.click('button:has-text("← Back to Plans")');
    
    // Step 3: Verify we're back on landing page
    await expect(page.locator('h1')).toContainText('PHONE PARTY');
    await expect(page.locator('text=Choose Your Plan')).toBeVisible();
    await expect(page.locator('button:has-text("Use Free Version")')).toBeVisible();
  });

  test('Landing Page Content Validation', async ({ page }) => {
    // Verify all required information is present
    
    // App description
    await expect(page.locator('text=Turn Phones Into One Big Speaker')).toBeVisible();
    
    // Information cards
    await expect(page.locator('text=Turn multiple phones into one synced speaker system')).toBeVisible();
    await expect(page.locator('text=Connect your friends\' phones and create a powerful surround sound experience')).toBeVisible();
    
    await expect(page.locator('text=Host plays music, guests hear it together')).toBeVisible();
    await expect(page.locator('text=One person controls the music, everyone hears it perfectly synced')).toBeVisible();
    
    await expect(page.locator('text=Perfect for parties, hangouts, and events')).toBeVisible();
    await expect(page.locator('text=Turn any space into an immersive audio experience')).toBeVisible();
    
    // Pricing section header
    await expect(page.locator('#viewLanding text=Choose Your Plan')).toBeVisible();
    
    // Free tier
    await expect(page.locator('text=FREE').first()).toBeVisible();
    await expect(page.locator('text=2 phones').first()).toBeVisible();
    await expect(page.locator('text=✓ Unlimited time')).toBeVisible();
    await expect(page.locator('text=✓ Basic features')).toBeVisible();
    
    // Party Pass tier
    await expect(page.locator('text=Most Popular')).toBeVisible();
    await expect(page.locator('text=£2.99').first()).toBeVisible();
    await expect(page.locator('text=✓ Up to 4 phones')).toBeVisible();
    await expect(page.locator('text=✓ 2-hour session')).toBeVisible();
    await expect(page.locator('text=✓ Preset messages')).toBeVisible();
    
    // Pro tier
    await expect(page.locator('text=£9.99 / month')).toBeVisible();
    await expect(page.locator('text=✓ 12+ phones')).toBeVisible();
    await expect(page.locator('text=✓ DJ features')).toBeVisible();
    await expect(page.locator('text=✓ Messaging & upgrades')).toBeVisible();
  });

  test('Account Creation Page Elements', async ({ page }) => {
    // Navigate to account creation
    await page.click('button:has-text("Use Free Version")');
    
    // Verify all elements are present
    await expect(page.locator('h1:has-text("Create Account / Log In")')).toBeVisible();
    await expect(page.locator('text=Create an account to unlock your selected tier')).toBeVisible();
    
    // Selected tier display
    await expect(page.locator('#viewAccountCreation .selected-tier-badge')).toContainText('FREE MODE');
    
    // Form fields
    await expect(page.locator('label:has-text("Email")')).toBeVisible();
    await expect(page.locator('label:has-text("Password")')).toBeVisible();
    await expect(page.locator('label:has-text("DJ Name (optional)")')).toBeVisible();
    
    // Buttons
    await expect(page.locator('button:has-text("Create Account & Continue")')).toBeVisible();
    await expect(page.locator('button:has-text("Log In Instead")')).toBeVisible();
    await expect(page.locator('button:has-text("Skip Account – Prototype Mode")')).toBeVisible();
    await expect(page.locator('button:has-text("← Back to Plans")')).toBeVisible();
    
    // Prototype mode section
    await expect(page.locator('h3:has-text("Testing Without Account?")')).toBeVisible();
    await expect(page.locator('text=Skip account creation and use prototype mode')).toBeVisible();
    await expect(page.locator('text=Note: Paid features require an account to activate')).toBeVisible();
  });
});
