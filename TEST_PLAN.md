# Test Plan: Local Music Picker Feature

## Overview
This test plan covers the local music picker feature that allows hosts to select and play audio files from their phone in the SyncSpeaker browser prototype.

## Feature Requirements
- Host can select ANY audio file type (accept="audio/*")
- Mobile-friendly on Android and iPhone
- Visible feedback for all operations (no silent failures)
- File size warnings for files > 50MB
- Browser compatibility warnings for unsupported file types
- Proper autoplay blocking handling

## Test Scenarios

### 1. Android Chrome - Basic Flow
**Steps:**
1. Open the app in Chrome on an Android device
2. Click "Start Party"
3. In the "Music (from your phone)" section, click "Choose music file"
4. Select an MP3, WAV, or M4A file from your device
5. Verify file name and size are displayed
6. Verify "✓ Ready" status pill appears
7. Click "Start party"
8. In the party view, verify the audio player shows the selected file
9. Click the "Play" button
10. Verify audio plays correctly

**Expected Results:**
- File picker opens and accepts any audio file
- File information displays correctly
- Audio player shows controls
- Status updates show "File selected: [filename]"
- Play button triggers audio playback
- Status updates to "Playing…"
- Audio plays without errors

---

### 2. iPhone Safari - Basic Flow
**Steps:**
1. Open the app in Safari on an iPhone
2. Click "Start Party"
3. In the "Music (from your phone)" section, tap "Choose music file"
4. Select an audio file (MP3, M4A recommended for iOS)
5. Verify file name and size are displayed
6. Verify "✓ Ready" status pill appears
7. Tap "Start party"
8. In the party view, verify the audio player shows the selected file
9. Tap the "Play" button in the controls
10. If autoplay is blocked, tap the play button in the audio controls or the Play button again

**Expected Results:**
- File picker opens correctly on iOS
- File information displays correctly
- Audio player shows with native iOS controls
- Status shows "File selected: [filename]"
- If autoplay is blocked, a visible message appears: "⚠️ Your browser blocked autoplay. Tap Play to start audio."
- Tapping Play button again starts playback
- Status updates to "Playing…"
- Audio plays correctly

---

### 3. Large File Warning
**Steps:**
1. Open the app on any device
2. Click "Start Party"
3. Click "Choose music file"
4. Select an audio file larger than 50MB
5. Observe the UI for warnings

**Expected Results:**
- File is accepted (not rejected)
- Warning banner appears: "⚠️ Large file — may take longer to load or stream."
- Warning banner is visible with yellow/warning styling
- File can still be played
- Status shows file is selected

---

### 4. Unsupported File Type Warning
**Steps:**
1. Open the app on any device
2. Click "Start Party"
3. Click "Choose music file"
4. Select an audio file with an uncommon format (e.g., FLAC, OGG on Safari)
5. Observe the UI for warnings

**Expected Results:**
- File is accepted (browser allows selection)
- If browser detects the file type may not play, warning appears: "⚠️ This file type may not play on this device. Try MP3 or M4A."
- Warning banner shows with error (red) styling
- File information still displays
- If playback fails, error message shows in status: "Error: File type not supported on this device"

---

### 5. File Change Functionality
**Steps:**
1. Open the app and start party creation
2. Click "Choose music file" and select a file
3. Verify "Change file" button appears and "Choose music file" is hidden
4. Click "Change file"
5. Select a different audio file
6. Verify file information updates

**Expected Results:**
- First file is loaded correctly
- "Change file" button becomes visible
- Clicking "Change file" opens file picker again
- Selecting new file replaces the old one
- Old ObjectURL is revoked (no memory leak)
- New file information displays
- Audio player source updates to new file

---

### 6. Playback Controls
**Steps:**
1. Complete basic flow to load and start playing a file
2. While audio is playing, click "Pause"
3. Verify audio pauses
4. Click "Play" again
5. Verify audio resumes

**Expected Results:**
- Pause button stops playback
- Status updates to "Paused"
- Play button resumes playback
- Status updates to "Playing…"
- Audio controls in the audio player work independently

---

### 7. No File Selected - Fallback Behavior
**Steps:**
1. Open the app and click "Start Party"
2. Do NOT select a music file
3. Click "Start party"
4. In party view, click "Play" button

**Expected Results:**
- Party is created successfully
- Status shows "No music loaded"
- Clicking Play shows: "Play (simulated - no music file loaded)"
- No errors occur
- Toast message appears with simulation notice

---

### 8. Autoplay Blocking Handling
**Steps:**
1. Use a browser with strict autoplay policies (e.g., Safari, Chrome with autoplay disabled)
2. Load an audio file and start party
3. Try to trigger playback programmatically (or via Play button if browser blocks initial play)
4. Observe error handling

**Expected Results:**
- If autoplay is blocked, visible warning appears: "⚠️ Your browser blocked autoplay. Tap Play to start audio."
- Warning is shown in the warning banner (not just console)
- Status message updates with the error
- Toast notification shows the error
- User can tap Play button again to start playback from gesture

---

### 9. Error Recovery - Corrupted File
**Steps:**
1. If possible, select a corrupted or partially downloaded audio file
2. Try to play it
3. Observe error handling

**Expected Results:**
- Error message appears in status area
- Error details show: "Error: File format not supported or corrupted"
- Warning banner shows suggestion: "Try a different file format (MP3, M4A)"
- No silent failures - all errors visible to user

---

### 10. Mobile Responsiveness
**Steps:**
1. Test on various screen sizes (phone portrait, phone landscape, tablet)
2. Verify all UI elements are accessible
3. Verify buttons are large enough for touch
4. Verify text is readable

**Expected Results:**
- Music picker section is fully visible and usable
- Buttons are touch-friendly (minimum 44px tap target)
- File information wraps properly on small screens
- Audio player controls are accessible
- No horizontal scrolling required
- All text is legible

---

## Cross-Browser Compatibility

### Browsers to Test
- **Android:** Chrome, Firefox, Samsung Internet
- **iOS:** Safari, Chrome (iOS)
- **Desktop (optional):** Chrome, Firefox, Safari, Edge

### File Formats to Test
- **High compatibility:** MP3, M4A (AAC)
- **Medium compatibility:** WAV, OGG
- **Low compatibility:** FLAC, OPUS, WMA

---

## Success Criteria
- ✅ All basic flows work on Android Chrome and iPhone Safari
- ✅ File size warnings appear for files > 50MB
- ✅ Unsupported file type warnings appear when appropriate
- ✅ Autoplay blocking is handled with visible user guidance
- ✅ No silent failures - all errors show visible feedback
- ✅ Audio playback works correctly with user gesture
- ✅ File changing works without memory leaks
- ✅ UI is mobile-friendly and responsive
- ✅ Existing party creation/join flow is not broken

---

## Known Limitations
- Some file formats (FLAC, OGG) may not play on all browsers
- Very large files (>100MB) may cause memory issues on older devices
- Autoplay policies vary by browser and user settings
- iOS Safari has stricter media playback requirements

---

## Regression Testing
- ✅ Party creation still works
- ✅ Party joining still works  
- ✅ Party Pass functionality unchanged
- ✅ Member management (kick, etc.) still works
- ✅ Pro/Free tier features still work
- ✅ Railway deployment configuration unchanged
