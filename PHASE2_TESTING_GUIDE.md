# Phase 2 Testing Guide: Audio Upload + HTTPS Streaming + Guest Sync

## Prerequisites

1. Server running: `npm start`
2. Two devices or browser windows
3. Audio file ready (MP3, M4A, WAV, etc.)

## Test 1: Basic Upload and Playback

### Host Setup
1. Open browser to `http://localhost:8080`
2. Click "Start a party (DJ)"
3. Enter name: "DJ Test"
4. Click "Choose music file"
5. Select an audio file (< 50MB recommended)
6. **Verify**: File name and size displayed
7. **Verify**: Upload progress shows
8. **Verify**: "✓ Ready" status appears
9. Note the party code displayed

### Guest Setup
1. Open second browser window/device to `http://localhost:8080`
2. Click "Join a party (Friend)"
3. Enter party code from Host
4. Enter name: "Guest 1"
5. Click "Join party"
6. **Verify**: Successfully joined

### Playback Test
1. **Host**: Click "Play" button
2. **Verify Host**: Audio plays locally
3. **Verify Guest**: "Tap to Sync" button appears
4. **Guest**: Click "Tap to Sync"
5. **Verify Guest**: Audio plays and syncs with host
6. **Verify Guest**: Sync quality indicator shows "Good" or "Medium"

### Expected Results
- ✅ Host hears audio from local file
- ✅ Guest streams audio from server (different URL)
- ✅ Audio plays in sync
- ✅ No errors in console

## Test 2: Mid-Track Join

### Setup
1. Complete Test 1 setup
2. **Host**: Let track play for 20-30 seconds

### Test Steps
1. **New Guest**: Open third browser window
2. Join party with code
3. **Verify**: "Tap to Sync" appears with elapsed time
4. Click "Tap to Sync"
5. **Verify**: Audio starts at correct position (matches host)
6. **Verify**: Sync quality is "Good" or "Medium"

### Expected Results
- ✅ New guest joins mid-track
- ✅ Audio position matches host (within 0.5s)
- ✅ Drift correction keeps sync tight

## Test 3: Drift Correction Over Time

### Test Steps
1. Start playback with host and guest
2. Let audio play for 2+ minutes
3. Monitor sync quality indicator
4. Check browser console for drift values

### Expected Behavior
- Drift stays < 0.15s most of the time (Good)
- If drift > 0.25s, automatic correction kicks in
- Guest audio resyncs automatically
- No audible glitches

### Metrics to Record
- Average drift: _______ seconds
- Worst drift: _______ seconds
- Number of corrections in 2 min: _______
- Sync quality rating: Good / Medium / Poor

## Test 4: Track Change (Queue)

### Setup (Future - Queue not fully implemented yet)
1. **Host**: Upload second track
2. **Host**: Queue the track
3. **Verify**: "Up Next" shows second track

### Test Steps
1. **Host**: Click "Next" or wait for track to end
2. **Verify Host**: Second track plays
3. **Verify Guest**: Receives TRACK_CHANGED event
4. **Verify Guest**: New "Tap to Sync" appears
5. **Guest**: Tap to sync to new track

### Expected Results
- ✅ Track changes smoothly
- ✅ Guest sees track change
- ✅ Guest can sync to new track

## Test 5: Error Handling

### Test 5a: Upload Failures
1. Try uploading non-audio file
2. **Expected**: Error message, upload rejected

### Test 5b: Unsupported File Types
1. Upload obscure audio format
2. **Expected**: Warning message about compatibility

### Test 5c: Network Interruption
1. Start playback
2. Disconnect/reconnect network
3. **Expected**: Graceful degradation, reconnect

### Test 5d: Large Files
1. Upload 40-50MB audio file
2. **Expected**: Progress bar, eventual success
3. **Verify**: Streaming works with Range requests

## Test 6: Debug Panel

### Test Steps
1. Click debug panel toggle button (🛠️)
2. **Verify**: Panel opens
3. **Verify**: Panel is scrollable
4. Scroll through debug info
5. Click close button
6. **Verify**: Panel closes
7. Reopen panel
8. **On mobile**: Try scrolling with touch
9. **Verify**: No stuck/frozen state

### Expected Results
- ✅ Panel opens and closes smoothly
- ✅ Content is scrollable
- ✅ No touch event blocking
- ✅ Works on mobile browsers

## Performance Metrics

### Join-to-Audio Time
- Time from "Join party" to hearing audio: _______ seconds
- Target: < 5 seconds

### Sync Quality
- Initial sync offset: _______ ms
- After 30s: _______ ms  
- After 1min: _______ ms
- After 2min: _______ ms

### Buffering
- Number of buffer events: _______
- Total buffering time: _______ seconds

## Browser Compatibility

Test on:
- [ ] Chrome (Desktop)
- [ ] Firefox (Desktop)
- [ ] Safari (Desktop)
- [ ] Chrome (Android)
- [ ] Safari (iOS)

## Known Limitations

1. **Railway Storage**: Uploaded tracks are deleted after 2 hours
2. **File Size**: 50MB limit per upload
3. **Browser Autoplay**: First play requires user gesture
4. **Mobile Safari**: May require user interaction for audio

## Troubleshooting

### Guest doesn't hear audio
- Check that upload completed successfully
- Verify trackUrl is set in server response
- Check browser console for network errors
- Try refreshing guest page

### Sync is poor (> 0.5s drift)
- Check network quality
- Look for buffering events
- Verify server timestamp accuracy
- Check if drift correction is running

### Upload fails
- Verify file is audio/* MIME type
- Check file size < 50MB
- Ensure server has write permissions to uploads/
- Check available disk space

## Success Criteria

All of the following must pass:

- ✅ Host can upload and play audio
- ✅ Guests hear streamed audio from server
- ✅ Mid-track join syncs correctly
- ✅ Drift correction keeps sync < 0.5s
- ✅ Debug panel remains functional
- ✅ No silent failures (all errors show feedback)
- ✅ Tests pass on mobile browsers

## Next Steps

After successful testing:
1. Deploy to Railway staging
2. Test with real mobile devices
3. Verify HTTPS streaming works
4. Load test with multiple guests
5. Monitor server resource usage
