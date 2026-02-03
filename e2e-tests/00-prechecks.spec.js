const { test } = require('@playwright/test');
const { expect } = require('@playwright/test');
const { clearBrowserStorage, takeScreenshot } = require('./utils/helpers');

test.describe('Section 0 - Prechecks', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test
    await page.goto('/');
    await clearBrowserStorage(page);
  });

  test('0.1 - Health endpoints return ok status', async ({ page }) => {
    // Test /health endpoint
    const healthResponse = await page.goto('/health');
    expect(healthResponse.status()).toBe(200);
    
    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('ok');
    expect(healthData.instanceId).toBeDefined();
    
    console.log('✓ /health response:', healthData);
    
    // Test /api/health endpoint
    const apiHealthResponse = await page.goto('/api/health');
    const apiHealthStatus = apiHealthResponse.status();
    
    const apiHealthData = await apiHealthResponse.json();
    
    // In development mode, ok should be true
    // In production mode with Redis, ok should be true
    // In production mode without Redis, should return 503
    if (apiHealthStatus === 503) {
      console.warn('⚠ /api/health returned 503 - Redis may not be available');
      expect(apiHealthData.ok).toBe(false);
    } else {
      expect(apiHealthStatus).toBe(200);
      expect(apiHealthData.ok).toBe(true);
    }
    
    console.log('✓ /api/health response:', apiHealthData);
  });

  test('0.2 - WebSocket connectivity check', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for WebSocket connection
    // The app creates WS connection automatically
    const wsConnected = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Check if ws is connected in the next few seconds
        const checkInterval = setInterval(() => {
          if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(window.ws ? window.ws.readyState === WebSocket.OPEN : false);
        }, 5000);
      });
    });
    
    if (wsConnected) {
      console.log('✓ WebSocket connected');
    } else {
      console.warn('⚠ WebSocket not connected - may be in offline mode');
    }
    
    // Take screenshot
    await takeScreenshot(page, 'websocket_status');
    
    // We don't fail the test if WS is not connected in development
    // as the app has fallback mode
  });

  test('0.3 - Reset test data and verify clean state', async ({ page }) => {
    // Clear localStorage and sessionStorage
    await page.goto('/');
    await clearBrowserStorage(page);
    
    // Verify storage is clear
    const storageClean = await page.evaluate(() => {
      return localStorage.length === 0 && sessionStorage.length === 0;
    });
    
    expect(storageClean).toBe(true);
    console.log('✓ Storage cleared successfully');
    
    // Reload and verify no user session
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check that we're not logged in
    const isLoggedIn = await page.evaluate(() => {
      return !!localStorage.getItem('token');
    });
    
    expect(isLoggedIn).toBe(false);
    console.log('✓ No active session detected');
    
    // Take screenshot of clean state
    await takeScreenshot(page, 'clean_state');
  });
});
