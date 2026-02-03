const { test } = require('@playwright/test');
const { expect } = require('@playwright/test');
const { 
  clearBrowserStorage, 
  generateTestEmail, 
  generateDJName,
  waitForToast,
  takeScreenshot,
  delay
} = require('./utils/helpers');

test.describe('Section 1 - Account Flow (Register/Login/Logout)', () => {
  let testAccounts = {};
  
  test.beforeAll(() => {
    // Generate test accounts for the entire suite
    testAccounts = {
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
    
    console.log('Generated test accounts:', testAccounts);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearBrowserStorage(page);
  });

  test('1.1 - Register new account (Host DJ - Account A)', async ({ page }) => {
    await page.goto('/');
    
    // Look for signup/register button or link
    // First check if there's a login/signup UI visible
    const signupButton = page.locator('button, a').filter({ hasText: /sign up|register|create account/i }).first();
    
    if (await signupButton.isVisible()) {
      await signupButton.click();
      await delay(500);
    }
    
    // Fill in registration form
    const emailInput = page.locator('input[type="email"], input[name="email"], input#email').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"], input#password').first();
    const djNameInput = page.locator('input[name="djName"], input[name="username"], input#djName, input#username').first();
    
    await emailInput.fill(testAccounts.hostDJ.email);
    await passwordInput.fill(testAccounts.hostDJ.password);
    
    // If DJ name field exists
    if (await djNameInput.isVisible().catch(() => false)) {
      await djNameInput.fill(testAccounts.hostDJ.djName);
    }
    
    // Take screenshot before submitting
    await takeScreenshot(page, 'register_form_filled');
    
    // Submit form
    const submitButton = page.locator('button[type="submit"], button').filter({ hasText: /sign up|register|create/i }).first();
    await submitButton.click();
    
    // Wait for success (could be toast, redirect, or success message)
    await delay(2000);
    
    // Check for success indicators
    const currentUrl = page.url();
    const hasToken = await page.evaluate(() => !!localStorage.getItem('token'));
    
    console.log('✓ Registration submitted');
    console.log('  - Current URL:', currentUrl);
    console.log('  - Has token:', hasToken);
    
    // Take screenshot after registration
    await takeScreenshot(page, 'after_registration');
    
    // Verify account persists after refresh
    await page.reload();
    await delay(1000);
    
    const stillLoggedIn = await page.evaluate(() => !!localStorage.getItem('token'));
    expect(stillLoggedIn).toBe(true);
    
    console.log('✓ Account persists after refresh');
  });

  test('1.2 - Logout then login again (Account A)', async ({ page }) => {
    // First register the account
    await page.goto('/');
    
    // Simulate signup (assuming API is available)
    await page.evaluate(async (account) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          djName: account.djName
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, testAccounts.hostDJ);
    
    await page.reload();
    await delay(1000);
    
    // Verify logged in
    let isLoggedIn = await page.evaluate(() => !!localStorage.getItem('token'));
    expect(isLoggedIn).toBe(true);
    
    console.log('✓ Account created via API');
    
    // Now logout
    await clearBrowserStorage(page);
    await page.reload();
    
    isLoggedIn = await page.evaluate(() => !!localStorage.getItem('token'));
    expect(isLoggedIn).toBe(false);
    
    console.log('✓ Logged out successfully');
    
    // Now login again
    const loginButton = page.locator('button, a').filter({ hasText: /log in|login|sign in/i }).first();
    
    if (await loginButton.isVisible().catch(() => false)) {
      await loginButton.click();
      await delay(500);
    }
    
    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    
    await emailInput.fill(testAccounts.hostDJ.email);
    await passwordInput.fill(testAccounts.hostDJ.password);
    
    // Submit
    const submitButton = page.locator('button[type="submit"], button').filter({ hasText: /log in|login|sign in/i }).first();
    await submitButton.click();
    
    await delay(2000);
    
    // Verify logged in
    isLoggedIn = await page.evaluate(() => !!localStorage.getItem('token'));
    expect(isLoggedIn).toBe(true);
    
    console.log('✓ Logged in successfully');
    
    // Verify profile info is correct
    const profileData = await page.evaluate(async () => {
      const response = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    });
    
    if (profileData) {
      expect(profileData.email).toBe(testAccounts.hostDJ.email);
      console.log('✓ Profile data verified:', profileData.email);
    }
    
    await takeScreenshot(page, 'logged_in_profile');
  });

  test('1.3 - Register Guest Account (Account B)', async ({ page }) => {
    await page.goto('/');
    
    // Create account via API
    const result = await page.evaluate(async (account) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          djName: account.djName
        })
      });
      
      return {
        ok: response.ok,
        status: response.status,
        data: response.ok ? await response.json() : null
      };
    }, testAccounts.guest1);
    
    expect(result.ok).toBe(true);
    console.log('✓ Guest Account B created:', testAccounts.guest1.email);
  });

  test('1.4 - Register Guest Account (Account C)', async ({ page }) => {
    await page.goto('/');
    
    // Create account via API
    const result = await page.evaluate(async (account) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          djName: account.djName
        })
      });
      
      return {
        ok: response.ok,
        status: response.status,
        data: response.ok ? await response.json() : null
      };
    }, testAccounts.guest2);
    
    expect(result.ok).toBe(true);
    console.log('✓ Guest Account C created:', testAccounts.guest2.email);
  });

  test('1.5 - Entitlement storage verification', async ({ page }) => {
    // Create an account
    await page.goto('/');
    
    const account = {
      email: generateTestEmail(),
      password: 'TestPass123!',
      djName: generateDJName()
    };
    
    // Register
    await page.evaluate(async (acc) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, account);
    
    await page.reload();
    await delay(1000);
    
    // Fetch user profile to check entitlements
    const profileData = await page.evaluate(async () => {
      const response = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    });
    
    expect(profileData).not.toBeNull();
    expect(profileData.tier).toBeDefined();
    
    console.log('✓ User profile retrieved:', {
      tier: profileData.tier,
      hasEntitlements: !!profileData.entitlements
    });
    
    // Clear localStorage and login again to verify entitlements persist
    await clearBrowserStorage(page);
    
    // Login again
    await page.evaluate(async (acc) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: acc.email,
          password: acc.password
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, account);
    
    // Fetch profile again
    const profileAfterLogin = await page.evaluate(async () => {
      const response = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    });
    
    expect(profileAfterLogin).not.toBeNull();
    expect(profileAfterLogin.tier).toBe(profileData.tier);
    
    console.log('✓ Entitlements persisted after logout/login');
  });
});
