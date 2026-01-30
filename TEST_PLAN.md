# SyncSpeaker Prototype - Test Plan

## Local Music File Picker + Host Playback (Option A)

### Test Scenario 1: Mobile Chrome/Android
**Objective:** Verify that users can select a local music file, start a party, and audio plays correctly.

**Steps:**
1. Open the app on Mobile Chrome/Android browser
2. Navigate to "Start a party (Host)" section
3. Click "Choose music file" button
4. Select an MP3/M4A/WAV file from device storage (Files/Downloads)
5. Verify that:
   - Selected filename appears with "Ready" status badge
   - Audio player becomes visible with controls
6. Click "Start party" button
7. Verify that:
   - Audio begins playing (or shows autoplay error if blocked)
   - Party code screen is displayed
   - Host state is maintained
   - Existing join flow is not broken

**Expected Results:**
- File selection works smoothly
- Audio playback starts on "Start party" click
- If autoplay is blocked, user sees: "⚠️ Tap play to allow audio (browser blocked autoplay)"
- Party creation proceeds regardless of autoplay status
- Party code is displayed correctly

### Test Scenario 2: iPhone Safari
**Objective:** Verify that local music file picker works on iOS Safari with proper fallback for autoplay restrictions.

**Steps:**
1. Open the app on iPhone Safari browser
2. Navigate to "Start a party (Host)" section
3. Click "Choose music file" button
4. Select an audio file from Files app
5. Verify that:
   - Selected filename appears with "Ready" status badge
   - Audio player becomes visible
6. Click "Start party" button
7. Verify that:
   - Audio playback is attempted
   - If autoplay is blocked (common on iOS), error message is displayed: "⚠️ Tap play to allow audio (browser blocked autoplay)"
   - User can manually tap the audio player's play button to start playback
   - Party code screen is displayed
   - Host can proceed with party setup

**Expected Results:**
- File selection interface works on iOS
- Autoplay restrictions are handled gracefully with visible error message
- Manual playback via audio controls works
- Party creation is not blocked by audio playback issues
- Error message provides clear instruction to user

### Test Scenario 3: Error Handling
**Objective:** Verify that appropriate error messages are shown when user tries to start party without selecting a file.

**Steps:**
1. Open the app
2. Navigate to "Start a party (Host)" section
3. Ensure source is set to "On this phone (best)"
4. Do NOT select any music file
5. Click "Start party" button
6. Verify that:
   - Party creation is prevented
   - Error message is displayed: "Please choose a music file first"
   - Additional warning appears: "⚠️ Please select a music file to continue"

**Expected Results:**
- Clear validation prevents starting party without music file
- User is guided to select a file before proceeding

### Test Scenario 4: Memory Management
**Objective:** Verify that object URLs are properly cleaned up to prevent memory leaks.

**Steps:**
1. Select a music file
2. Select a different music file
3. Navigate away from the host page
4. Return to host page
5. Verify that:
   - Previous file selection is cleared
   - Audio player is reset
   - No memory leaks occur (check browser dev tools if possible)

**Expected Results:**
- File selection state is properly reset
- Object URLs are revoked when changing files or navigating away
- No accumulation of blob URLs in memory

### Test Scenario 5: Existing Join Flow
**Objective:** Verify that the new file picker does not break the existing guest join functionality.

**Steps:**
1. Create a party as host (with music file selected)
2. On a second device/browser, navigate to "Join a party (Friend)"
3. Enter the party code
4. Join the party
5. Verify that:
   - Guest can join successfully
   - Party state is maintained
   - No errors occur
   - Host's music selection does not interfere with guest experience

**Expected Results:**
- Guest join flow works exactly as before
- No regressions in existing functionality

### Supported Audio Formats
- MP3 (.mp3)
- M4A (.m4a)
- WAV (.wav)
- Other browser-supported audio formats

### Known Limitations
- Mobile browsers (especially iOS Safari) often block autoplay for media
- Users may need to manually tap play button after party creation
- This is expected browser behavior for user protection
