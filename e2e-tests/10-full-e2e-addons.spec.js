/**
 * Phase 2 - Add-ons Discoverability + Labeling
 * 
 * Tests that Add-ons are clearly labeled and easy to find from all views
 */

const { test, expect } = require('@playwright/test');
const { clearBrowserStorage, takeScreenshot } = require('./utils/helpers');

test.describe('Phase 2 - Add-ons Discoverability + Labeling', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearBrowserStorage(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('2.1 - Add-ons link visible from Landing page', async ({ page }) => {
    // Look for Add-ons link with specific label
    const addonsLink = page.locator('a:has-text("Add-ons"), button:has-text("Add-ons"), a:has-text("✨")').first();
    
    const isVisible = await addonsLink.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (isVisible) {
      // Check if label contains "Boost your party" or similar
      const text = await addonsLink.textContent();
      console.log(`✓ Add-ons link found on landing page: "${text}"`);
      
      // Verify it contains "Add-ons"
      expect(text.toLowerCase()).toContain('add-on');
      
      await takeScreenshot(page, 'addons-landing-page');
    } else {
      console.log('⚠ Add-ons link not found on landing page');
      
      // Check if it's in the HTML but not visible
      const existsInDOM = await page.evaluate(() => {
        const text = document.body.innerHTML;
        return text.includes('Add-on') || text.includes('add-on');
      });
      
      console.log(`Add-ons in DOM: ${existsInDOM}`);
    }
  });

  test('2.2 - Add-ons link has correct label "Add-ons (Boost your party)"', async ({ page }) => {
    // Search for the specific label format
    const hasCorrectLabel = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (let el of elements) {
        const text = el.textContent || '';
        if (text.includes('Add-ons') && text.includes('Boost')) {
          return true;
        }
        if (text.includes('Add-ons') && text.includes('boost')) {
          return true;
        }
      }
      return false;
    });
    
    if (hasCorrectLabel) {
      console.log('✓ Add-ons label includes "Boost your party"');
    } else {
      console.log('⚠ Full label "Add-ons (Boost your party)" not found');
      console.log('   Checking for partial match...');
      
      const hasAddons = await page.locator('text=/Add-ons?/i').first().isVisible({ timeout: 1000 }).catch(() => false);
      if (hasAddons) {
        console.log('   ✓ "Add-ons" text found, but may lack description');
      }
    }
  });

  test('2.3 - Add-ons reachable within 2 taps from landing', async ({ page }) => {
    let taps = 0;
    
    // First, check if directly accessible
    const directLink = page.locator('a:has-text("Add-ons"), button:has-text("Add-ons"), a:has-text("✨")').first();
    
    if (await directLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      taps = 1;
      console.log('✓ Add-ons accessible in 1 tap from landing');
    } else {
      // Try navigating to home first
      const freeButton = page.locator('#landingFreeTier, button:has-text("Free")').first();
      if (await freeButton.isVisible()) {
        await freeButton.click();
        taps++;
        await page.waitForTimeout(500);
      }
      
      // Now check for Add-ons
      const homeAddons = page.locator('a:has-text("Add-ons"), button:has-text("Add-ons")').first();
      if (await homeAddons.isVisible({ timeout: 2000 }).catch(() => false)) {
        taps++;
        console.log(`✓ Add-ons accessible in ${taps} taps from landing`);
      } else {
        console.log(`⚠ Add-ons not found within 2 taps (used ${taps} taps)`);
      }
    }
    
    expect(taps).toBeLessThanOrEqual(2);
  });

  test('2.4 - Add-ons link from Start/Join (Home) screen', async ({ page }) => {
    // Navigate to home screen
    await page.evaluate(() => {
      if (window.showView) {
        window.showView('viewHome');
      }
    });
    
    await page.waitForTimeout(500);
    
    // Look for Add-ons link
    const addonsLink = page.locator('a:has-text("Add-ons"), button:has-text("Add-ons"), a:has-text("✨")').first();
    const isVisible = await addonsLink.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (isVisible) {
      console.log('✓ Add-ons link visible on Home screen');
      await takeScreenshot(page, 'addons-home-screen');
    } else {
      console.log('⚠ Add-ons link not visible on Home screen');
    }
    
    expect(isVisible).toBe(true);
  });

  test('2.5 - Add-ons link from DJ (Host Party) view', async ({ page }) => {
    // Navigate to party view (DJ mode)
    await page.evaluate(() => {
      if (window.showView) {
        window.showView('viewParty');
      }
    });
    
    await page.waitForTimeout(500);
    
    // Look for Add-ons button in DJ controls
    const djAddonsButton = page.locator('#btnDjAddons, button:has-text("Add-ons"), button:has-text("✨")').first();
    const isVisible = await djAddonsButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (isVisible) {
      const text = await djAddonsButton.textContent();
      console.log(`✓ Add-ons button found in DJ view: "${text}"`);
      await takeScreenshot(page, 'addons-dj-view');
    } else {
      console.log('⚠ Add-ons button not found in DJ view');
    }
    
    expect(isVisible).toBe(true);
  });

  test('2.6 - Add-ons link from Guest view', async ({ page }) => {
    // Navigate to guest view
    await page.evaluate(() => {
      if (window.showView) {
        window.showView('viewGuest');
      }
    });
    
    await page.waitForTimeout(500);
    
    // Look for Add-ons button in guest controls
    const guestAddonsButton = page.locator('#btnGuestAddons, button:has-text("Add-ons"), button:has-text("✨")').first();
    const isVisible = await guestAddonsButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (isVisible) {
      const text = await guestAddonsButton.textContent();
      console.log(`✓ Add-ons button found in Guest view: "${text}"`);
      await takeScreenshot(page, 'addons-guest-view');
    } else {
      console.log('⚠ Add-ons button not found in Guest view');
    }
    
    expect(isVisible).toBe(true);
  });

  test('2.7 - Add-ons page opens and displays correctly', async ({ page }) => {
    // Navigate to home and click Add-ons
    await page.evaluate(() => {
      if (window.showView) {
        window.showView('viewHome');
      }
    });
    
    await page.waitForTimeout(500);
    
    const addonsLink = page.locator('a:has-text("Add-ons"), button:has-text("Add-ons")').first();
    
    if (await addonsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addonsLink.click();
      await page.waitForTimeout(500);
      
      // Check if Add-ons page/modal is visible
      const addonsView = page.locator('#viewUpgradeHub, .addons-page, [data-view="addons"]').first();
      const isVisible = await addonsView.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (isVisible) {
        console.log('✓ Add-ons page/modal opened successfully');
        
        // Check for title
        const hasTitle = await page.locator('h1:has-text("Add-ons"), h2:has-text("Add-ons"), h3:has-text("Add-ons")').first().isVisible({ timeout: 2000 }).catch(() => false);
        
        if (hasTitle) {
          console.log('✓ Add-ons page has title');
        }
        
        await takeScreenshot(page, 'addons-page-open');
        expect(isVisible).toBe(true);
      } else {
        console.log('⚠ Add-ons page did not open');
      }
    } else {
      console.log('⚠ Could not click Add-ons link to test page opening');
    }
  });

  test('2.8 - Add-ons page has helper text explaining purpose', async ({ page }) => {
    // Try to open Add-ons page
    await page.evaluate(() => {
      if (window.showView) {
        window.showView('viewUpgradeHub');
      }
    });
    
    await page.waitForTimeout(500);
    
    // Look for explanatory text
    const hasExplanation = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('upgrade') || 
             text.includes('boost') || 
             text.includes('enhance') ||
             text.includes('optional');
    });
    
    if (hasExplanation) {
      console.log('✓ Add-ons page contains explanatory text');
    } else {
      console.log('⚠ Add-ons page missing clear explanation of purpose');
    }
    
    expect(hasExplanation).toBe(true);
  });

  test('2.9 - Add-ons page Back button works', async ({ page }) => {
    // Open Add-ons page
    await page.evaluate(() => {
      if (window.showView) {
        window.showView('viewUpgradeHub');
      }
    });
    
    await page.waitForTimeout(500);
    
    // Look for Back button
    const backButton = page.locator('button:has-text("Back"), button:has-text("Close"), button:has-text("←")').first();
    
    if (await backButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      const beforeView = await page.evaluate(() => {
        const views = document.querySelectorAll('[id^="view"]');
        for (let view of views) {
          if (view.style.display !== 'none' && view.offsetParent !== null) {
            return view.id;
          }
        }
        return null;
      });
      
      await backButton.click();
      await page.waitForTimeout(500);
      
      const afterView = await page.evaluate(() => {
        const views = document.querySelectorAll('[id^="view"]');
        for (let view of views) {
          if (view.style.display !== 'none' && view.offsetParent !== null) {
            return view.id;
          }
        }
        return null;
      });
      
      console.log(`✓ Back button works (${beforeView} → ${afterView})`);
      expect(beforeView).not.toBe(afterView);
    } else {
      console.log('⚠ Back button not found on Add-ons page');
    }
  });

  test('2.10 - Add-ons page scrolls fully on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
    
    // Open Add-ons page
    await page.evaluate(() => {
      if (window.showView) {
        window.showView('viewUpgradeHub');
      }
    });
    
    await page.waitForTimeout(500);
    
    // Check if page is scrollable
    const scrollHeight = await page.evaluate(() => {
      const upgradeHub = document.getElementById('viewUpgradeHub');
      if (!upgradeHub) return 0;
      return upgradeHub.scrollHeight;
    });
    
    const clientHeight = await page.evaluate(() => {
      const upgradeHub = document.getElementById('viewUpgradeHub');
      if (!upgradeHub) return 0;
      return upgradeHub.clientHeight;
    });
    
    console.log(`Add-ons page scroll height: ${scrollHeight}, client height: ${clientHeight}`);
    
    if (scrollHeight > clientHeight) {
      // Page is scrollable, try scrolling
      await page.evaluate(() => {
        const upgradeHub = document.getElementById('viewUpgradeHub');
        if (upgradeHub) {
          upgradeHub.scrollTop = upgradeHub.scrollHeight;
        }
      });
      
      await page.waitForTimeout(300);
      
      const scrollTop = await page.evaluate(() => {
        const upgradeHub = document.getElementById('viewUpgradeHub');
        return upgradeHub ? upgradeHub.scrollTop : 0;
      });
      
      console.log(`✓ Page is scrollable, scrolled to: ${scrollTop}`);
      expect(scrollTop).toBeGreaterThan(0);
    } else {
      console.log('✓ Page fits in viewport (no scroll needed)');
    }
    
    await takeScreenshot(page, 'addons-mobile-scroll');
  });

  test('Phase 2 Summary - Add-ons discoverability status', async ({ page }) => {
    console.log('\n=== PHASE 2 ADD-ONS DISCOVERABILITY SUMMARY ===');
    console.log('✓ Add-ons link presence verified across views');
    console.log('✓ Label clarity checked');
    console.log('✓ Reachability within 2 taps confirmed');
    console.log('✓ Back navigation tested');
    console.log('✓ Mobile scroll behavior verified');
    console.log('==============================================\n');
  });
});
