/**
 * Tests for Leaderboard and Profile UI
 */

const fs = require('fs');
const path = require('path');

describe('Leaderboard and Profile UI', () => {
  let htmlContent;
  let cssContent;
  
  beforeAll(() => {
    htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  });
  
  describe('HTML Structure', () => {
    test('Leaderboard view exists', () => {
      expect(htmlContent).toContain('id="viewLeaderboard"');
    });
    
    test('My Profile view exists', () => {
      expect(htmlContent).toContain('id="viewMyProfile"');
    });
    
    test('Leaderboard navigation button exists', () => {
      expect(htmlContent).toContain('id="btnLeaderboard"');
    });
    
    test('Profile navigation button exists', () => {
      expect(htmlContent).toContain('id="btnProfile"');
    });
    
    test('Leaderboard has DJ and Guest tabs', () => {
      expect(htmlContent).toContain('id="btnTabDjs"');
      expect(htmlContent).toContain('id="btnTabGuests"');
    });
    
    test('Leaderboard has lists for DJs and Guests', () => {
      expect(htmlContent).toContain('id="djsList"');
      expect(htmlContent).toContain('id="guestsList"');
    });
    
    test('Profile has required sections', () => {
      expect(htmlContent).toContain('id="profileDjName"');
      expect(htmlContent).toContain('id="profileTier"');
      expect(htmlContent).toContain('id="profileDjScore"');
      expect(htmlContent).toContain('id="profileDjRank"');
    });
    
    test('Profile has upgrade status elements', () => {
      expect(htmlContent).toContain('id="upgradeVerifiedBadge"');
      expect(htmlContent).toContain('id="upgradeCrownEffect"');
      expect(htmlContent).toContain('id="upgradeAnimatedName"');
      expect(htmlContent).toContain('id="upgradeReactionTrail"');
    });
    
    test('Profile has entitlements list', () => {
      expect(htmlContent).toContain('id="profileEntitlements"');
    });
  });
  
  describe('CSS Styles', () => {
    test('Leaderboard styles exist', () => {
      expect(cssContent).toContain('.leaderboard-tabs');
      expect(cssContent).toContain('.leaderboard-item');
      expect(cssContent).toContain('.leaderboard-rank');
    });
    
    test('Profile styles exist', () => {
      expect(cssContent).toContain('.profile-header');
      expect(cssContent).toContain('.profile-section');
      expect(cssContent).toContain('.stat-item');
    });
    
    test('Navigation button styles exist', () => {
      expect(cssContent).toContain('.btn-leaderboard');
      expect(cssContent).toContain('.btn-profile');
    });
  });
});
