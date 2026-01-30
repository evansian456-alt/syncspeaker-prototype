# Upgrade Flows Test Plan

This document outlines the test steps for verifying the Party Pass and Pro Monthly upgrade flows.

## Prerequisites
- Open http://localhost:8080 (or your deployment URL) in a mobile browser or desktop browser with mobile viewport
- Clear localStorage before each test to ensure clean state

## Test 1: Party Pass Activation from Banner

**Steps:**
1. Navigate to landing page
2. Click "🎉 Start Party" button
3. Click "Start party" button (without selecting Pro mode)
4. Observe the Party Pass upgrade banner appears
5. Click "Activate Party Pass" button in banner
6. **Expected:** Party Pass unlock modal appears with:
   - Title: "Unlock this party 🎉"
   - Price: "£2.99 · 2 hours"
   - Copy: "One-time purchase. Ends automatically. No account required."
   - Feature list with checkmarks
   - "Activate Party Pass" CTA button
   - "Not now" secondary button
7. Click "Activate Party Pass" button
8. **Expected:** Modal closes, shows "Processing payment..." toast
9. Wait 1-2 seconds
10. **Expected:** 
    - Toast shows "🎉 Party Pass activated! Enjoy 2 hours of Pro features!"
    - Plan pill shows "🎉 Party Pass · Active"
    - Banner shows "Party Pass Active" with "2h 0m remaining"
    - "Show ad" button is disabled
    - Ad line says "No ads (Pro)"

**Result:** ✅ Pass / ❌ Fail

---

## Test 2: Ad Interrupt Upgrade Flow

**Steps:**
1. Start a new party (free tier)
2. Click "Show ad (Free)" button
3. Wait 2 seconds
4. **Expected:** "Remove ads from your party" modal appears with:
   - Title: "Remove ads from your party"
   - Description: "Upgrade to enjoy uninterrupted playback!"
   - Two upgrade options: Party Pass (£2.99 · 2 hours) and Pro Monthly (£9.99/month)
   - "Continue with ads" button
5. Click "Party Pass" button
6. **Expected:** Proceeds to Party Pass unlock modal (same as Test 1)

**Result:** ✅ Pass / ❌ Fail

---

## Test 3: Pro Monthly Flow

**Steps:**
1. Start a new party (free tier)
2. Click "Show ad (Free)" button
3. Wait for ad interrupt modal to appear
4. Click "Pro Monthly" button
5. **Expected:** Account creation modal appears with:
   - Title: "Create an account to manage your subscription"
   - Description about billing management
   - Three auth buttons: Apple, Google, Email
   - "Not now" button
6. Click "✉️ Continue with Email" button
7. **Expected:** Shows "Connecting to Email..." toast
8. Wait 1 second
9. **Expected:** Pro subscription modal appears with:
   - Title: "Go Pro Monthly"
   - Price: "£9.99 / month"
   - Copy: "Cancel anytime. No long-term commitment."
   - Feature list (Unlimited parties, No ads, Up to 10 phones, etc.)
   - "Subscribe to Pro" button
   - "Not now" button
10. Click "Subscribe to Pro" button
11. **Expected:**
    - Modal closes, shows "Processing subscription..." toast
    - Wait 1-2 seconds
    - Toast shows "🎉 Pro Monthly activated! Enjoy unlimited ad-free parties!"
    - Plan pill shows "💎 Pro Monthly"
    - "Show ad" button is disabled
    - Ad line says "No ads (Pro)"

**Result:** ✅ Pass / ❌ Fail

---

## Test 4: Party Pass 10-Minute Warning

**Steps:**
1. Start a party and activate Party Pass
2. In browser console, manually trigger the warning by setting time to 9 minutes remaining:
   ```javascript
   state.partyPassEndTime = Date.now() + (9 * 60 * 1000);
   updatePartyPassTimer();
   ```
3. **Expected:** Modal appears with:
   - Title: "Party's almost over 🎶"
   - Description: "Only 10 minutes of Party Pass remaining!"
   - Two buttons: "Extend Party Pass (£2.99 · 2 hours)" and "Go Pro Monthly"
   - "Continue with time left" button
4. Click "Extend Party Pass" button
5. **Expected:**
   - Modal closes, processes checkout
   - Timer extends by 2 more hours
   - Toast shows "🎉 Party Pass extended by 2 hours!"

**Result:** ✅ Pass / ❌ Fail

---

## Test 5: Party Pass Expiry

**Steps:**
1. Start a party and activate Party Pass
2. In browser console, manually expire the Party Pass:
   ```javascript
   state.partyPassEndTime = Date.now() - 1000;
   updatePartyPassTimer();
   ```
3. **Expected:** Modal appears with:
   - Title: "Party ended"
   - Description: "Your 2-hour Party Pass has expired."
   - Two buttons: "Start New Party Pass (£2.99)" and "Go Pro Monthly"
   - "Continue with Free" button
4. Verify ads are re-enabled
5. Click "Continue with Free" button
6. **Expected:** Modal closes, party continues in free mode

**Result:** ✅ Pass / ❌ Fail

---

## Test 6: Add Phone Upgrade Entry Point

**Steps:**
1. Start a party (free tier)
2. In browser console, simulate having 2 members (at free limit):
   ```javascript
   state.snapshot.members.push({ id: 'guest-1', name: 'Guest 1', isPro: false });
   renderRoom();
   ```
3. Click "Add another phone" button
4. **Expected:** Party Pass unlock modal appears (trying to add 3rd phone)
5. Click "Not now" button
6. **Expected:** Modal closes, no phone added

**Result:** ✅ Pass / ❌ Fail

---

## Test 7: Speaker Upgrade Entry Point

**Steps:**
1. Start a party (free tier)
2. Click "Use a speaker" button
3. **Expected:** Party Pass unlock modal appears
4. Click "Not now" button
5. **Expected:** Modal closes, speaker not activated

**Result:** ✅ Pass / ❌ Fail

---

## Test 8: Pricing Page Entry Point

**Steps:**
1. On landing page, scroll to Pricing section
2. Click "Activate Party Pass" button in the Party Pass pricing card
3. **Expected:** Toast shows "Start a party to activate Party Pass"
4. **Expected:** Navigate to home view
5. Start a party
6. Click "Activate Party Pass" from banner
7. **Expected:** Party Pass unlock modal appears

**Result:** ✅ Pass / ❌ Fail

---

## Test 9: Modal Cancellation

**Steps:**
1. Open any upgrade modal
2. Click "Not now" or secondary button
3. **Expected:** Modal closes, no state changes
4. Verify party continues normally

**Result:** ✅ Pass / ❌ Fail

---

## Test 10: Existing Party Flow Not Broken

**Steps:**
1. Navigate to landing page
2. Click "🎉 Start Party"
3. Enter host name
4. Click "Start party"
5. **Expected:** Party created successfully with code displayed
6. Verify all existing features work:
   - Copy code button
   - Play/Pause buttons
   - Connection strength display
   - Leave button
7. **Expected:** All features work as before

**Result:** ✅ Pass / ❌ Fail

---

## Test 11: Mobile Responsiveness

**Steps:**
1. Test all modals on mobile viewport (320px - 768px width)
2. **Expected:** All modals display correctly:
   - Text is readable
   - Buttons are tappable
   - Images/icons scale appropriately
   - No horizontal scrolling
   - Proper spacing maintained

**Result:** ✅ Pass / ❌ Fail

---

## Test 12: Parent-Friendly Copy Verification

**Steps:**
1. Review all modal copy for parent-friendly language
2. **Expected:** All modals use approved language:
   - ✅ "One-time purchase"
   - ✅ "Ends automatically"
   - ✅ "Cancel anytime"
   - ✅ "No long-term commitment"
   - ✅ "No account required" (Party Pass)
   - ❌ No aggressive subscription wording

**Result:** ✅ Pass / ❌ Fail

---

## Notes
- All tests should be performed on both mobile and desktop viewports
- Clear localStorage between tests for consistent results
- Console errors should be monitored during testing
- Network requests should not fail (WebSocket errors expected in prototype mode)
