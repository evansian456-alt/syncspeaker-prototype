/**
 * Comprehensive Feature Verification Test
 * Tests all 9 features of SyncSpeaker app
 */

const fs = require('fs');
const path = require('path');

describe('SyncSpeaker Feature Verification', () => {
  let htmlContent, cssContent, jsContent;

  beforeAll(() => {
    // Load the source files
    htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
    jsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  });

  describe('Feature #1: Crowd Energy Meter', () => {
    test('should have crowd energy elements in HTML', () => {
      expect(htmlContent).toContain('id="crowdEnergyCard"');
      expect(htmlContent).toContain('id="crowdEnergyValue"');
      expect(htmlContent).toContain('id="crowdEnergyFill"');
      expect(htmlContent).toContain('id="crowdEnergyPeakValue"');
    });

    test('should have crowd energy functions in JS', () => {
      expect(jsContent).toContain('initCrowdEnergyMeter');
      expect(jsContent).toContain('increaseCrowdEnergy');
      expect(jsContent).toContain('updateCrowdEnergyDisplay');
    });

    test('should have crowd energy styles in CSS', () => {
      expect(cssContent).toContain('.crowd-energy-card');
      expect(cssContent).toContain('.crowd-energy-meter');
    });
  });

  describe('Feature #2: DJ Moment Buttons', () => {
    test('should have all 4 DJ moment buttons in HTML', () => {
      expect(htmlContent).toContain('id="btnMomentDrop"');
      expect(htmlContent).toContain('id="btnMomentBuild"');
      expect(htmlContent).toContain('id="btnMomentBreak"');
      expect(htmlContent).toContain('id="btnMomentHandsUp"');
      expect(htmlContent).toContain('id="currentMomentDisplay"');
    });

    test('should have DJ moment functions in JS', () => {
      expect(jsContent).toContain('initDJMoments');
      expect(jsContent).toContain('triggerDJMoment');
    });

    test('should have DJ moment styles in CSS', () => {
      expect(cssContent).toContain('.btn-dj-moment');
      expect(cssContent).toContain('.moment-effect-drop');
      expect(cssContent).toContain('.moment-effect-build');
    });
  });

  describe('Feature #3: Party End Recap', () => {
    test('should have recap modal elements in HTML', () => {
      expect(htmlContent).toContain('id="modalPartyRecap"');
      expect(htmlContent).toContain('id="recapDuration"');
      expect(htmlContent).toContain('id="recapTracks"');
      expect(htmlContent).toContain('id="recapPeakEnergy"');
      expect(htmlContent).toContain('id="recapReactions"');
      expect(htmlContent).toContain('id="topEmojisList"');
    });

    test('should have recap functions in JS', () => {
      expect(jsContent).toContain('initSessionStats');
      expect(jsContent).toContain('showPartyRecap');
      expect(jsContent).toContain('initPartyRecap');
    });
  });

  describe('Feature #4: Smart Upsell Timing', () => {
    test('should have upsell elements in HTML', () => {
      expect(htmlContent).toContain('id="partyPassBanner"');
    });

    test('should have smart upsell logic in JS', () => {
      expect(jsContent).toContain('checkSmartUpsell');
    });
  });

  describe('Feature #5: Host-Gifted Party Pass', () => {
    test('should have gift party pass elements in HTML', () => {
      expect(htmlContent).toContain('id="hostGiftSection"');
      expect(htmlContent).toContain('id="btnGiftPartyPass"');
    });

    test('should have gift functions in JS', () => {
      expect(jsContent).toContain('initHostGiftPartyPass');
      expect(jsContent).toContain('activateGiftedPartyPass');
    });
  });

  describe('Feature #6: Parent-Friendly Info Toggle', () => {
    test('should have parent info button and modal in HTML', () => {
      expect(htmlContent).toContain('id="btnParentInfo"');
      expect(htmlContent).toContain('id="modalParentInfo"');
      expect(htmlContent).toContain('id="btnCloseParentInfo"');
    });

    test('should have all 5 info sections in modal', () => {
      expect(htmlContent).toContain('What is SyncSpeaker?');
      expect(htmlContent).toContain('Safety Features');
      expect(htmlContent).toContain('How It Works');
      expect(htmlContent).toContain('Pricing');
      expect(htmlContent).toContain('Important Notes');
    });

    test('should have parent info init in JS', () => {
      expect(jsContent).toContain('initParentInfo');
    });
  });

  describe('Feature #7: Guest Anonymity by Default', () => {
    test('should have nickname input fields in HTML', () => {
      expect(htmlContent).toContain('id="hostName"');
      expect(htmlContent).toContain('id="guestName"');
    });

    test('should have anonymity functions in JS', () => {
      expect(jsContent).toContain('getAnonymousGuestName');
      expect(jsContent).toContain('applyGuestAnonymity');
    });
  });

  describe('Feature #8: Beat-Aware UI', () => {
    test('should have beat pulse functions in JS', () => {
      expect(jsContent).toContain('initBeatAwareUI');
      expect(jsContent).toContain('startBeatPulse');
      expect(jsContent).toContain('stopBeatPulse');
    });

    test('should have beat pulse styles in CSS', () => {
      expect(cssContent).toContain('.beat-pulse');
    });
  });

  describe('Feature #9: Party Themes', () => {
    test('should have theme toggle button in HTML', () => {
      expect(htmlContent).toContain('id="btnThemeToggle"');
    });

    test('should have theme functions in JS', () => {
      expect(jsContent).toContain('initThemeSelector');
      expect(jsContent).toContain('cycleTheme');
      expect(jsContent).toContain('applyTheme');
    });

    test('should have all 4 theme CSS classes defined', () => {
      expect(cssContent).toContain('.theme-neon');
      expect(cssContent).toContain('.theme-dark-rave');
      expect(cssContent).toContain('.theme-festival');
      expect(cssContent).toContain('.theme-minimal');
    });
  });

  describe('Core Functionality', () => {
    test('should have main navigation buttons', () => {
      expect(htmlContent).toContain('id="btnCreate"');
      expect(htmlContent).toContain('id="btnJoin"');
    });

    test('should have header with info and theme buttons', () => {
      expect(htmlContent).toContain('<header');
      expect(htmlContent).toContain('SyncSpeaker');
      expect(htmlContent).toContain('btnParentInfo');
      expect(htmlContent).toContain('btnThemeToggle');
    });

    test('should have pricing section', () => {
      expect(htmlContent).toContain('Free Plan');
      expect(htmlContent).toContain('Party Pass');
      expect(htmlContent).toContain('Pro Monthly');
    });

    test('should initialize all features', () => {
      expect(jsContent).toContain('initializeAllFeatures');
      expect(jsContent).toContain('All 9 features initialized');
    });
  });
});
