/**
 * E2E Test for Leaderboard and Profile Pages
 */

const { test, expect } = require('@playwright/test');

test.describe('Leaderboard and Profile UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:8080');
  });

  test('should display leaderboard button in header', async ({ page }) => {
    const leaderboardBtn = page.locator('#btnLeaderboard');
    await expect(leaderboardBtn).toBeVisible();
    await expect(leaderboardBtn).toHaveAttribute('title', 'Leaderboard');
  });

  test('should display profile button in header', async ({ page }) => {
    const profileBtn = page.locator('#btnProfile');
    await expect(profileBtn).toBeVisible();
    await expect(profileBtn).toHaveAttribute('title', 'My Profile');
  });

  test('should navigate to leaderboard view when clicking leaderboard button', async ({ page }) => {
    // Click leaderboard button
    await page.click('#btnLeaderboard');
    
    // Wait for leaderboard view to be visible
    await expect(page.locator('#viewLeaderboard')).toBeVisible();
    
    // Check for leaderboard heading
    await expect(page.locator('#viewLeaderboard h1')).toContainText('LEADERBOARD');
    
    // Check for tabs
    await expect(page.locator('#btnTabDjs')).toBeVisible();
    await expect(page.locator('#btnTabGuests')).toBeVisible();
  });

  test('should navigate to profile view when clicking profile button', async ({ page }) => {
    // Click profile button
    await page.click('#btnProfile');
    
    // Wait for profile view to be visible
    await expect(page.locator('#viewMyProfile')).toBeVisible();
    
    // Check for profile heading
    await expect(page.locator('#viewMyProfile h1')).toContainText('MY PROFILE');
  });

  test('should switch between DJ and Guest leaderboards', async ({ page }) => {
    // Click leaderboard button
    await page.click('#btnLeaderboard');
    
    // DJ leaderboard should be visible by default
    await expect(page.locator('#leaderboardDjs')).toBeVisible();
    await expect(page.locator('#leaderboardGuests')).not.toBeVisible();
    
    // Click Guests tab
    await page.click('#btnTabGuests');
    
    // Guest leaderboard should now be visible
    await expect(page.locator('#leaderboardGuests')).toBeVisible();
    await expect(page.locator('#leaderboardDjs')).not.toBeVisible();
    
    // Click DJs tab again
    await page.click('#btnTabDjs');
    
    // DJ leaderboard should be visible again
    await expect(page.locator('#leaderboardDjs')).toBeVisible();
    await expect(page.locator('#leaderboardGuests')).not.toBeVisible();
  });

  test('should go back from leaderboard to landing', async ({ page }) => {
    // Navigate to leaderboard
    await page.click('#btnLeaderboard');
    await expect(page.locator('#viewLeaderboard')).toBeVisible();
    
    // Click back button
    await page.click('#btnBackFromLeaderboard');
    
    // Should return to landing page
    await expect(page.locator('#viewLanding')).toBeVisible();
  });

  test('should go back from profile to landing', async ({ page }) => {
    // Navigate to profile
    await page.click('#btnProfile');
    await expect(page.locator('#viewMyProfile')).toBeVisible();
    
    // Click back button
    await page.click('#btnBackFromProfile');
    
    // Should return to landing page
    await expect(page.locator('#viewLanding')).toBeVisible();
  });
});
