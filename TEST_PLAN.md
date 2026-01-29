# Test Plan for Audio File Picker Feature

## Manual Test Checklist

### Environment Setup
- [ ] Mobile device with Chrome browser (Android)
- [ ] Test audio file (MP3, WAV, or other supported format) accessible on the device
- [ ] Stable network connection (Wi-Fi or mobile data)

### Test 1: File Selection and UI Feedback
**Objective**: Verify the file picker works and shows appropriate status

1. [ ] Open the app in Chrome on Android
2. [ ] Navigate to "Start a party (Host)" section
3. [ ] Verify "Choose music file" input is visible
4. [ ] Tap on the file input
5. [ ] Select an audio file from the device
6. [ ] **Expected**: File name appears with "✓ [filename] — Ready" status in green
7. [ ] **Expected**: No error messages shown

### Test 2: Validation - Missing Name
**Objective**: Verify name validation works

1. [ ] Clear the "Your name" field (make it empty)
2. [ ] Select a music file
3. [ ] Tap "Start party" button
4. [ ] **Expected**: Error message "Please enter your name" appears
5. [ ] **Expected**: Party does NOT start
6. [ ] **Expected**: No audio plays

### Test 3: Validation - Missing File
**Objective**: Verify file selection validation works

1. [ ] Enter a name in "Your name" field
2. [ ] Do NOT select any music file
3. [ ] Tap "Start party" button
4. [ ] **Expected**: Error message "Please select a music file before starting the party" appears
5. [ ] **Expected**: Party does NOT start

### Test 4: Successful Party Start with Audio Playback
**Objective**: Verify complete flow works correctly

1. [ ] Enter a name in "Your name" field (e.g., "Host")
2. [ ] Select a music file
3. [ ] Verify "Ready" status shows
4. [ ] Tap "Start party" button
5. [ ] **Expected**: Audio starts playing immediately
6. [ ] **Expected**: Party code appears (6-character code like "ABC123")
7. [ ] **Expected**: UI transitions to party view
8. [ ] **Expected**: Party code is displayed prominently
9. [ ] **Expected**: "Host party" title is shown
10. [ ] **Expected**: Connection strength widget appears
11. [ ] **Expected**: No error messages

### Test 5: Autoplay Blocking Handling
**Objective**: Verify graceful handling of browser autoplay restrictions

1. [ ] If possible, enable strict autoplay blocking in browser settings
2. [ ] Follow Test 4 steps
3. [ ] **Expected**: If autoplay is blocked, error message appears like:
   - "Browser blocked autoplay. Please tap the play button on your audio player."
   - OR "Tap Play to allow audio"
4. [ ] **Expected**: Party does NOT start if audio fails to play
5. [ ] **Expected**: User can retry after allowing audio

### Test 6: Multiple File Selection
**Objective**: Verify changing files works correctly

1. [ ] Select a music file (File A)
2. [ ] Verify "Ready" status for File A
3. [ ] Select a different music file (File B)
4. [ ] **Expected**: Status updates to show File B name
5. [ ] Tap "Start party"
6. [ ] **Expected**: File B plays (not File A)

### Test 7: Different Audio Formats
**Objective**: Verify support for common audio formats

1. [ ] Test with MP3 file
   - [ ] **Expected**: Works correctly
2. [ ] Test with WAV file (if available)
   - [ ] **Expected**: Works correctly
3. [ ] Test with M4A file (if available)
   - [ ] **Expected**: Works correctly OR shows "format not supported" error

### Test 8: Join as Guest (Verify No Regression)
**Objective**: Ensure guest functionality still works

1. [ ] Open app on a second device or tab
2. [ ] In "Join a party" section, enter the party code from Test 4
3. [ ] Enter guest name
4. [ ] Tap "Join party"
5. [ ] **Expected**: Successfully joins party
6. [ ] **Expected**: Guest sees party members list
7. [ ] **Expected**: Host sees guest in members list

### Test 9: Audio Element Presence
**Objective**: Verify hidden audio element exists

1. [ ] Open browser developer tools (if possible on mobile)
2. [ ] Inspect DOM
3. [ ] **Expected**: Find `<audio id="hostAudio" controls>` element
4. [ ] **Expected**: Element has `display:none` style or is hidden
5. [ ] **Expected**: Element has a blob URL as src when file is selected

### Test 10: Clean Navigation
**Objective**: Verify clean state management

1. [ ] Start a party with audio file
2. [ ] Tap "Leave" button
3. [ ] **Expected**: Returns to home screen
4. [ ] **Expected**: File status is cleared
5. [ ] **Expected**: Previous file selection is cleared
6. [ ] Select a NEW file
7. [ ] **Expected**: New file works correctly
8. [ ] **Expected**: No memory leaks or old blob URLs

## Success Criteria

All tests should pass with the following outcomes:
- ✅ File picker is visible and functional
- ✅ File selection shows immediate visual feedback
- ✅ Name and file validations prevent invalid party creation
- ✅ Audio plays from user interaction (Start party button)
- ✅ Party code displays after successful start
- ✅ Autoplay blocking is handled gracefully with clear error messages
- ✅ No Spotify or Apple Music integration present
- ✅ Existing guest functionality remains intact

## Known Limitations

- Audio sync across multiple devices may vary by browser and network conditions
- Some audio formats may not be supported on all devices
- Autoplay policies vary by browser version and settings
- Mobile browsers may have additional restrictions on audio playback

## Notes

- This is a prototype for testing user flow and concept
- Focus on usability and "would you use this?" feedback
- Audio synchronization is not perfect in browsers - this is expected
- The feature should work on mobile Chrome/Android as the primary target
