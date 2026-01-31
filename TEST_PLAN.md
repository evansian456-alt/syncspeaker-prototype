# Test Plan: SyncSpeaker Prototype - All Features

## Overview
This test plan covers all features of the SyncSpeaker browser prototype, including the original local music picker and 9 new features.

## Features Covered
1. **Local Music Picker** (Original)
2. **Crowd Energy Meter** - Track reactions/messages, decay over time
3. **DJ Moment Buttons** - DROP/BUILD/BREAK/HANDS UP with visual effects
4. **Party End Recap** - Stats screen when party ends
5. **Smart Upsell Timing** - Context-aware upgrade prompts
6. **Host-gifted Party Pass** - Host can unlock for everyone
7. **Parent-Friendly Info Toggle** - Info panel for parents
8. **Guest Anonymity by Default** - Guest 1, Guest 2, etc.
9. **Beat-aware UI** - Pulse animations synced to music/energy
10. **Party Themes** - 4 CSS themes (Neon, Dark Rave, Festival, Minimal)

---

## FEATURE 1: Crowd Energy Meter

### Test 1.1: Energy Meter Display (Host Only)
**Steps:**
1. Create a party as host
2. Verify the Crowd Energy Meter card appears below the party pass banner
3. Check that the meter shows "0" energy initially

**Expected Results:**
- ✅ Crowd Energy card visible on host view
- ✅ Energy value displays "0"
- ✅ Meter bar is empty
- ✅ Peak indicator at 0%

### Test 1.2: Energy Increases with Reactions
**Steps:**
1. Open party in two devices (host + guest)
2. From guest, send emoji reactions (❤️, 🔥, 🎉)
3. Observe host's energy meter

**Expected Results:**
- ✅ Energy increases by ~5 per emoji reaction
- ✅ Meter bar fills proportionally
- ✅ Energy value updates in real-time

### Test 1.3: Energy Decay Over Time
**Steps:**
1. Send several reactions to boost energy to 50+
2. Stop sending reactions
3. Wait and observe energy meter

**Expected Results:**
- ✅ Energy decreases by 1 every 2 seconds
- ✅ Meter bar width decreases smoothly
- ✅ Energy never goes below 0

### Test 1.4: Peak Energy Tracking
**Steps:**
1. Send reactions to reach energy of 80
2. Let energy decay to 40
3. Check peak indicator position

**Expected Results:**
- ✅ Peak indicator stays at 80% position
- ✅ Peak value shows "80"
- ✅ Peak doesn't decrease when energy decays

### Test 1.5: Energy-Based Glow Effects
**Steps:**
1. Boost energy to different levels (10, 45, 75)
2. Observe visual effects on energy card

**Expected Results:**
- ✅ 10-40 energy: Low glow
- ✅ 40-70 energy: Medium glow
- ✅ 70+ energy: High glow with pulse animation

---

## FEATURE 2: DJ Moment Buttons

### Test 2.1: DJ Moment Buttons Display (Host Only)
**Steps:**
1. Create party as host
2. Verify DJ Moments card appears

**Expected Results:**
- ✅ DJ Moments card visible below energy meter
- ✅ 4 buttons visible: DROP, BUILD, BREAK, HANDS UP
- ✅ Each button has icon and label

### Test 2.2: Trigger DROP Moment
**Steps:**
1. Click "DROP" button
2. Observe visual effects

**Expected Results:**
- ✅ Button becomes highlighted/active
- ✅ "Current: DROP" indicator appears
- ✅ Scale/flash animation plays on party view
- ✅ Toast shows "DJ Moment: DROP"

### Test 2.3: Trigger BUILD Moment
**Steps:**
1. Click "BUILD" button
2. Observe effects

**Expected Results:**
- ✅ Button becomes active
- ✅ Current moment updates to "BUILD"
- ✅ Pulsing scale animation plays
- ✅ Previous moment button deactivates

### Test 2.4: Moment Auto-Clear
**Steps:**
1. Trigger any moment
2. Wait 8+ seconds

**Expected Results:**
- ✅ Moment indicator disappears after 8 seconds
- ✅ Active button returns to normal state
- ✅ Can trigger new moment immediately

### Test 2.5: All Moment Types
**Steps:**
1. Test each moment button: DROP, BUILD, BREAK, HANDS UP
2. Verify each has unique animation

**Expected Results:**
- ✅ DROP: Scale burst effect
- ✅ BUILD: Gradual pulse
- ✅ BREAK: Fade effect
- ✅ HANDS UP: Vertical bounce

---

## FEATURE 3: Party End Recap

### Test 3.1: Show Recap on Leave
**Steps:**
1. Create party as host
2. Play music for a few minutes
3. Send/receive some reactions
4. Click "Leave" button

**Expected Results:**
- ✅ Party Recap modal appears
- ✅ Modal shows party duration (in minutes)
- ✅ Stats display: Tracks Played, Peak Energy, Total Reactions

### Test 3.2: Track Stats Accuracy
**Steps:**
1. Create party
2. Play 2 tracks
3. Send 15 emoji reactions
4. Boost energy to 75 at some point
5. Leave party

**Expected Results:**
- ✅ Tracks Played: 2
- ✅ Total Reactions: 15
- ✅ Peak Energy: 75
- ✅ Duration: Actual time in minutes

### Test 3.3: Top Emojis Display
**Steps:**
1. Send mix of reactions: 5x❤️, 3x🔥, 8x🎉, 2x⭐
2. Leave party and check recap

**Expected Results:**
- ✅ Top emojis sorted by count
- ✅ Shows: 🎉 (8), ❤️ (5), 🔥 (3), ⭐ (2)
- ✅ Limited to top 5 emojis
- ✅ Shows count next to each emoji

### Test 3.4: Empty Stats Handling
**Steps:**
1. Create party
2. Don't play music or send reactions
3. Leave immediately

**Expected Results:**
- ✅ Duration: 0 min
- ✅ Tracks: 0
- ✅ Peak Energy: 0
- ✅ Reactions: 0
- ✅ "No reactions yet" message

### Test 3.5: Close Recap
**Steps:**
1. View recap modal
2. Click "Close" button

**Expected Results:**
- ✅ Modal closes
- ✅ Returns to landing page
- ✅ Stats are preserved until new party

---

## FEATURE 4: Smart Upsell Timing

### Test 4.1: No Upsell on Pro Users
**Steps:**
1. Enable "Support mode (Pro)" toggle
2. Create party and use for 15+ minutes

**Expected Results:**
- ✅ No upsell banner shown
- ✅ Party continues normally

### Test 4.2: Upsell After 10 Minutes + 2 Tracks
**Steps:**
1. Create free party
2. Play 2 tracks
3. Wait 10+ minutes

**Expected Results:**
- ✅ Party Pass upgrade banner appears
- ✅ Message: "You've been partying for 10+ minutes!"
- ✅ Banner shows £2.99 Party Pass option

### Test 4.3: Upsell on High Energy + 3 Tracks
**Steps:**
1. Create free party
2. Play 3 tracks
3. Boost energy to 70+

**Expected Results:**
- ✅ Upgrade banner appears
- ✅ Message: "The party's heating up!"
- ✅ Party Pass button visible

### Test 4.4: Upsell Dismissed After Upgrade
**Steps:**
1. Trigger upsell
2. Activate Party Pass
3. Continue partying

**Expected Results:**
- ✅ Upsell banner disappears after activation
- ✅ No more upsells shown

---

## FEATURE 5: Host-Gifted Party Pass

### Test 5.1: Gift Section Display (Host Only)
**Steps:**
1. Create party as free host
2. Check DJ Controls card

**Expected Results:**
- ✅ "Gift Party Pass to Everyone" section visible
- ✅ Shows £2.99 price
- ✅ Button: "🎉 Unlock Party for Everyone"

### Test 5.2: Activate Gifted Party Pass
**Steps:**
1. Click "Unlock Party for Everyone"
2. Confirm in dialog
3. Observe changes

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ After confirm, Party Pass activates
- ✅ Toast: "Party Pass activated! Everyone now has Pro features!"
- ✅ Plan pill updates to "Party Pass · Active"
- ✅ Gift section disappears

### Test 5.3: Party Pass Timer
**Steps:**
1. Activate gifted Party Pass
2. Check party pass banner

**Expected Results:**
- ✅ Timer shows remaining time (e.g., "1h 59m remaining")
- ✅ Timer counts down
- ✅ Party Pass status shows "Active"

### Test 5.4: Gift Section Hidden for Pro
**Steps:**
1. Enable Pro toggle before creating party
2. Create party
3. Check DJ Controls

**Expected Results:**
- ✅ Gift section not visible
- ✅ Already has Pro features

---

## FEATURE 6: Parent-Friendly Info Toggle

### Test 6.1: Info Button Visible
**Steps:**
1. Open app (any page)
2. Check header

**Expected Results:**
- ✅ ℹ️ button visible in header (top right)
- ✅ Button styled as circular icon
- ✅ Hover effect works

### Test 6.2: Open Parent Info Panel
**Steps:**
1. Click ℹ️ button in header
2. Read content

**Expected Results:**
- ✅ Modal appears with title "👪 For Parents"
- ✅ Contains sections: What is SyncSpeaker, Safety Features, How It Works, Pricing, Important Notes
- ✅ Content is clear and informative
- ✅ Modal is scrollable

### Test 6.3: Info Panel Content
**Steps:**
1. Open info panel
2. Verify all sections present

**Expected Results:**
- ✅ Explains app purpose
- ✅ Lists safety features (no music included, local network, host controls, anonymity)
- ✅ Shows pricing (Free, Party Pass, Pro)
- ✅ Includes important notes

### Test 6.4: Close Info Panel
**Steps:**
1. Open info panel
2. Click "Close" button

**Expected Results:**
- ✅ Modal closes
- ✅ Returns to previous view

---

## FEATURE 7: Guest Anonymity by Default

### Test 7.1: Host Without Nickname
**Steps:**
1. Go to "Start a party"
2. Leave nickname field EMPTY
3. Click "Start party"
4. Check party meta

**Expected Results:**
- ✅ Host appears as "Guest 1"
- ✅ Party displays "You: Guest 1 (Host)"

### Test 7.2: Guest Without Nickname
**Steps:**
1. Go to "Join a party"
2. Enter valid code
3. Leave nickname field EMPTY
4. Click "Join party"

**Expected Results:**
- ✅ Guest appears as "Guest 2" (or next number)
- ✅ Guest count increments for each anonymous guest

### Test 7.3: Multiple Anonymous Guests
**Steps:**
1. Create party
2. Join with 3 devices, all without nicknames
3. Check member list

**Expected Results:**
- ✅ Host: "Guest 1"
- ✅ Guests: "Guest 2", "Guest 3", "Guest 4"
- ✅ Each has unique number

### Test 7.4: Custom Nickname Still Works
**Steps:**
1. Enter "DJ Alex" as nickname
2. Create party
3. Check name

**Expected Results:**
- ✅ Shows "DJ Alex" instead of "Guest N"
- ✅ Custom nickname preferred over anonymous

### Test 7.5: Placeholder Text
**Steps:**
1. Check nickname input fields

**Expected Results:**
- ✅ Host field: "Optional - Leave blank for 'Guest 1'"
- ✅ Guest field: "Optional - Leave blank for 'Guest 2'"
- ✅ Clear indication that field is optional

---

## FEATURE 8: Beat-Aware UI

### Test 8.1: Pulse on Play
**Steps:**
1. Create party
2. Select and play music
3. Observe UI

**Expected Results:**
- ✅ Subtle pulse animation starts on party view
- ✅ Energy meter card pulses if energy > 50

### Test 8.2: Stop Pulse on Pause
**Steps:**
1. While music playing with pulse
2. Click Pause
3. Observe UI

**Expected Results:**
- ✅ Pulse animation stops
- ✅ UI returns to static state

### Test 8.3: Beat Pulse on Reactions
**Steps:**
1. Send emoji reaction
2. Observe UI

**Expected Results:**
- ✅ Single pulse animation triggers
- ✅ Animation lasts ~0.6 seconds
- ✅ Returns to subtle pulse if playing

### Test 8.4: Energy-Based Pulse Intensity
**Steps:**
1. Play music
2. Boost energy to different levels
3. Observe pulse intensity

**Expected Results:**
- ✅ Higher energy = more visible pulse
- ✅ Pulse syncs with energy level
- ✅ Smooth transitions

---

## FEATURE 9: Party Themes

### Test 9.1: Theme Toggle Button
**Steps:**
1. Open app
2. Check header

**Expected Results:**
- ✅ 🎨 theme button visible in header
- ✅ Next to info button

### Test 9.2: Cycle Through Themes
**Steps:**
1. Click theme button repeatedly
2. Observe color changes

**Expected Results:**
- ✅ Cycles: Neon → Dark Rave → Festival → Minimal → Neon
- ✅ Toast shows current theme name
- ✅ Colors update smoothly

### Test 9.3: Neon Theme (Default)
**Steps:**
1. Select Neon theme
2. Check colors

**Expected Results:**
- ✅ Blue/purple gradient (#5AA9FF, #8B7CFF)
- ✅ Dark background
- ✅ Glow effects

### Test 9.4: Dark Rave Theme
**Steps:**
1. Click theme button until Dark Rave
2. Check colors

**Expected Results:**
- ✅ Magenta/cyan colors (#FF00FF, #00FFFF)
- ✅ Pure black background
- ✅ High contrast

### Test 9.5: Festival Theme
**Steps:**
1. Select Festival theme
2. Check colors

**Expected Results:**
- ✅ Gold/pink colors (#FFD700, #FF6B9D)
- ✅ Purple background
- ✅ Warm, vibrant feel

### Test 9.6: Minimal Theme
**Steps:**
1. Select Minimal theme
2. Check colors

**Expected Results:**
- ✅ Light background (white/light gray)
- ✅ Blue accent (#2196F3)
- ✅ Clean, simple design
- ✅ High readability

### Test 9.7: Theme Persistence
**Steps:**
1. Select Festival theme
2. Refresh page
3. Check theme

**Expected Results:**
- ✅ Theme persists after refresh
- ✅ Saved to localStorage
- ✅ Loads on app start

---

## Integration Tests

### Integration 1: Full Host Flow with All Features
**Steps:**
1. Open app, click parent info, close
2. Click theme button, select Dark Rave
3. Start party (anonymous, no nickname)
4. Verify appears as "Guest 1"
5. Select music file
6. Click Play
7. Verify crowd energy meter visible
8. Click DJ Moment "DROP"
9. Observe beat pulse and moment effect
10. Wait for smart upsell (if free)
11. Click "Unlock Party for Everyone"
12. Activate Party Pass
13. Click Leave
14. View Party Recap

**Expected Results:**
- ✅ All features work together
- ✅ No conflicts or errors
- ✅ Smooth user experience

### Integration 2: Guest Experience
**Steps:**
1. Join party (leave nickname blank)
2. Appears as "Guest 2"
3. Send emoji reactions
4. Host sees energy increase
5. Host triggers DJ moments
6. Guest sees visual effects (if synced)

**Expected Results:**
- ✅ Anonymous guest name works
- ✅ Reactions tracked properly
- ✅ Energy updates correctly

---

## Cross-Browser & Mobile Testing

### Browsers to Test
- **Android:** Chrome, Firefox, Samsung Internet
- **iOS:** Safari, Chrome (iOS)
- **Desktop:** Chrome, Firefox, Safari, Edge

### Test All Features On:
- ✅ Android Chrome (primary)
- ✅ iPhone Safari (primary)
- ✅ Desktop Chrome
- ✅ Desktop Firefox

---

## Regression Testing

### Verify Existing Features Still Work:
- ✅ Party creation (offline mode)
- ✅ Music file selection
- ✅ Play/Pause controls
- ✅ DJ Screen overlay
- ✅ Guest message sending
- ✅ Chat mode controls (OPEN/EMOJI_ONLY/LOCKED)
- ✅ Party Pass timer
- ✅ Member display
- ✅ Promo codes

---

## Success Criteria

### All Features Implemented:
1. ✅ Crowd Energy Meter working
2. ✅ DJ Moment Buttons functional
3. ✅ Party End Recap displays correctly
4. ✅ Smart Upsell appears at right times
5. ✅ Host Gift Party Pass works
6. ✅ Parent Info panel accessible
7. ✅ Guest Anonymity default behavior
8. ✅ Beat-aware UI animations
9. ✅ 4 Party Themes selectable

### Quality Checks:
- ✅ Mobile-first design (works on phones)
- ✅ EDM/DJ visual aesthetic maintained
- ✅ No breaking changes to existing features
- ✅ No console errors
- ✅ Performance acceptable (no lag)
- ✅ All UI elements visible and accessible

---

## Multi-Device Party Discovery Testing (CRITICAL)

### Prerequisites
- Server running (`npm start`)
- Two physical devices with different network connections
- Debug mode enabled (`?debug=1` in URL)

### Test 1: Android Chrome - Same Wi-Fi Network
**Steps:**
1. **Device A (Host - Android Chrome):**
   - Open app on Wi-Fi network
   - Click "Start a party"
   - Enter optional nickname
   - Click "Start party"
   - **VERIFY**: Party code displayed immediately (e.g., "ABC123")
   - **VERIFY**: Debug panel shows app version
   - Copy the party code

2. **Device B (Guest - Android Chrome):**
   - Open app on same Wi-Fi network
   - Click "Join a party"
   - Enter the party code from Device A
   - Click "Join party"
   - **VERIFY**: Status shows "Looking for party…"
   - **VERIFY**: Status shows "Attempt 1/3" if needed
   - **VERIFY**: Join succeeds within 3 attempts
   - **VERIFY**: No "Party not found" error

**Expected Results:**
- ✅ Host creates party successfully
- ✅ Guest finds and joins party immediately
- ✅ Debug panel shows matching app versions
- ✅ No 404 errors in console
- ✅ Status messages show clear progress

### Test 2: Android Chrome - Host Mobile Hotspot
**Steps:**
1. **Device A (Host - Android Chrome):**
   - Enable mobile hotspot on Device A
   - Open app while hotspot is active
   - Create party as in Test 1
   - Copy party code

2. **Device B (Guest - Android Chrome):**
   - Connect to Device A's mobile hotspot
   - Open app
   - Join party using code from Device A
   - **VERIFY**: Join succeeds despite different network type

**Expected Results:**
- ✅ Party creation works on mobile hotspot
- ✅ Guest on hotspot can join immediately
- ✅ Connection stable throughout session

### Test 3: iPhone Safari - Same Wi-Fi Network
**Steps:**
1. **Device A (Host - iPhone Safari):**
   - Open app on Wi-Fi network
   - Create party
   - Copy party code

2. **Device B (Guest - iPhone Safari):**
   - Open app on same Wi-Fi network
   - Join using host's party code
   - **VERIFY**: Join succeeds without retry

**Expected Results:**
- ✅ Works on iOS Safari
- ✅ No iOS-specific errors
- ✅ UI displays correctly on iPhone

### Test 4: Cross-Platform (Android Host + iPhone Guest)
**Steps:**
1. **Device A (Host - Android Chrome):**
   - Create party on Wi-Fi
   - Copy party code

2. **Device B (Guest - iPhone Safari):**
   - Join party on same Wi-Fi
   - **VERIFY**: Cross-platform join works

**Expected Results:**
- ✅ Android and iOS devices can connect
- ✅ No platform-specific issues

### Test 5: Immediate Join (Timing Test)
**Steps:**
1. Device A creates party
2. Device B joins **immediately** (within 2 seconds of code display)
3. **VERIFY**: Join succeeds without retry

**Expected Results:**
- ✅ Immediate join works (no race condition)
- ✅ No 404 error on immediate join

### Test 6: Delayed Join (10 Second Wait)
**Steps:**
1. Device A creates party
2. Wait 10 seconds
3. Device B joins using party code
4. **VERIFY**: Join succeeds

**Expected Results:**
- ✅ Party still discoverable after 10 seconds
- ✅ No expiration issues

### Test 7: Debug Endpoint Verification
**Steps:**
1. Device A creates party with code ABC123
2. **From any browser**, navigate to:
   ```
   http://[server-url]/api/party/ABC123
   ```
3. **VERIFY** response shows:
   ```json
   {
     "exists": true,
     "code": "ABC123",
     "createdAt": "[timestamp]",
     "hostConnected": true/false,
     "guestCount": 0,
     "totalMembers": 1
   }
   ```
4. **Test case-insensitive lookup:**
   - Navigate to: `http://[server-url]/api/party/abc123` (lowercase)
   - **VERIFY** response still shows `exists: true` with code `"ABC123"` (uppercase)

**Expected Results:**
- ✅ Debug endpoint returns party info
- ✅ `exists: true` for valid parties
- ✅ `exists: false` for invalid codes
- ✅ Guest count increments when guests join
- ✅ Lowercase codes work (case-insensitive)

### Test 8: Error Message Clarity
**Steps:**
1. Device B attempts to join with invalid code "NOEXST"
2. **VERIFY** error message shows:
   - "HTTP 404: Party not found" (not just "Party not found")
   - Retry attempt count (e.g., "attempt 2/3")
   - Debug info shows endpoint and status code

**Expected Results:**
- ✅ HTTP status code visible in error
- ✅ Retry attempts shown clearly
- ✅ No silent failures
- ✅ Debug panel shows last error

### Test 9: Network Timeout Handling
**Steps:**
1. Turn off server while Device B attempts to join
2. **VERIFY**: Clear timeout error message
3. **VERIFY**: "Server not responding" message shown

**Expected Results:**
- ✅ Timeout errors handled gracefully
- ✅ User-friendly timeout message
- ✅ No indefinite waiting

### Test 10: Multiple Retries Exhausted
**Steps:**
1. Device B joins with code that doesn't exist
2. Let all 3 retry attempts fail
3. **VERIFY**: Final error message clear
4. **VERIFY**: Button re-enabled after failure

**Expected Results:**
- ✅ All 3 retries attempted
- ✅ Clear final error message
- ✅ Button returns to "Join party" state
- ✅ User can try again

---

## Multi-Device Test Summary Checklist

### Critical Scenarios
- [ ] Android Chrome (Wi-Fi) → Android Chrome (Wi-Fi) ✅
- [ ] Android Chrome (Hotspot) → Android Chrome (Hotspot) ✅
- [ ] iPhone Safari (Wi-Fi) → iPhone Safari (Wi-Fi) ✅
- [ ] Android Chrome → iPhone Safari (cross-platform) ✅
- [ ] Immediate join (< 2 seconds) ✅
- [ ] Delayed join (10+ seconds) ✅

### Debug & Observability
- [ ] Debug endpoint `/api/party/:code` works ✅
- [ ] App version visible in debug panel ✅
- [ ] HTTP status codes shown in errors ✅
- [ ] Retry attempts counted and displayed ✅

### Error Handling
- [ ] 404 errors retry automatically ✅
- [ ] Timeout errors show clear message ✅
- [ ] Network errors handled gracefully ✅
- [ ] Button re-enables after failure ✅

---

## Known Limitations
- Browser prototype, not production app
- WebSocket sync not tested (offline mode)
- Party Pass payment is simulated
- Beat pulse is visual only (no actual audio analysis)
- Theme changes affect entire app, not per-party
