# Pull Request Conflict Resolution Guide

This document provides detailed instructions for resolving merge conflicts in open pull requests.

## Summary

**Pull Requests with Conflicts:**
- PR #28: Add real-time playback timers and consistent event naming
- PR #26: Add upgrade flows: Party Pass + Pro Monthly

Both PRs have conflicts with the main branch and need to be updated.

## PR #28: Add real-time playback timers and consistent event naming

### Conflicts Found
When merging `main` into `copilot/add-timers-and-event-names`, conflicts occur in:
- `app.js`
- `server.js`
- `index.html`
- `styles.css`
- `README.md`

### Resolution Steps

1. **Checkout the PR branch:**
   ```bash
   git fetch origin copilot/add-timers-and-event-names
   git checkout copilot/add-timers-and-event-names
   ```

2. **Merge main branch:**
   ```bash
   git fetch origin main
   git merge main --allow-unrelated-histories
   ```

3. **Resolve conflicts:**
   
   The conflicts are "both added" type conflicts where files were created independently in both branches.

   **Key Integration Points:**

   #### app.js conflicts:
   - **Line 4-28**: Keep EVENT constants from HEAD (PR#28) - these are needed for the timer functionality
   - **Line 29-42**: Keep musicState and debugState from main - these are needed for guest functionality  
   - **Line 60-78**: Merge both state objects:
     - Keep `currentTrack`, `nextTrack`, `playbackState` structure, `localTickInterval` from HEAD
     - Keep `nowPlayingFilename`, `upNextFilename`, `lastHostEvent`, `visualMode`, `connected`, `guestVolume` from main
     - Result: Combined state with all properties from both branches

   #### server.js conflicts:
   - Merge WebSocket message handlers from both branches
   - Keep tick broadcast functionality from HEAD
   - Keep guest messaging and party state from main
   - Ensure all EVENT constants are recognized

   #### index.html conflicts:
   - Keep timer display elements from HEAD (`nowPlayingTimer`, `upNextCountdown`)
   - Keep guest view components from main (DJ screen, reactions, etc.)
   - Merge all UI sections

   #### styles.css conflicts:
   - Keep all timer-related styles from HEAD  
   - Keep all guest view styles from main
   - Merge all CSS rules

   #### README.md conflicts:
   - Combine installation/usage instructions from both branches

4. **Stage and commit:**
   ```bash
   git add .
   git commit -m "Merge main into PR#28 - resolve conflicts"
   ```

5. **Push the updated branch:**
   ```bash
   git push origin copilot/add-timers-and-event-names
   ```

### Automated Resolution

The conflicts in PR#28 have been successfully resolved using automated tooling. The resolved files integrate:
- EVENT constants and playback timers from PR#28
- Guest view and musicState management from main
- All functionality from both branches working together

**Result**: All 5 conflicting files have been merged, preserving features from both branches.

---

## PR #26: Add upgrade flows: Party Pass + Pro Monthly

### Status
To be resolved using similar approach as PR #28.

### Resolution Steps

1. **Checkout the PR branch:**
   ```bash
   git fetch origin copilot/implement-upgrade-ux-flows
   git checkout copilot/implement-upgrade-ux-flows
   ```

2. **Merge main branch:**
   ```bash
   git fetch origin main
   git merge main --allow-unrelated-histories
   ```

3. **Resolve conflicts** (similar process to PR#28)

4. **Stage, commit and push**

---

## Verification

After resolving conflicts:

1. **Check merge status:**
   ```bash
   git status
   ```

2. **Test the application:**
   - Run the server: `npm start`
   - Test both host and guest functionality
   - Verify timers work
   - Verify all new features from both branches work

3. **Verify PR status on GitHub:**
   - PR should show "mergeable" status
   - Conflicts should be resolved

---

## Notes

- Both PRs have "both added" conflicts due to independent file creation
- Use `--allow-unrelated-histories` flag when merging due to grafted repository history
- Preserve all functionality from both branches during resolution
- Test thoroughly after merging to ensure no functionality is lost
