# Merge Conflict Resolution Guide

## Quick Reference for Resolving PRs #26, #40, #41

### Problem
Three PRs modify the same files with overlapping features, causing merge conflicts.

### Recommended Merge Order

```
1. PR #26 (Upgrade flows)          ← MERGE FIRST
2. PR #40 (Three-tier monetization) ← REBASE & MERGE SECOND  
3. PR #41 (9 monetization features) ← REBASE & MERGE THIRD
4. PR #30 (Verify conflicts)        ← CLOSE (no value)
```

---

## Step-by-Step: Merging PR #26

### Prerequisites
```bash
git checkout main
git pull origin main
git checkout copilot/implement-upgrade-ux-flows
```

### Verification
```bash
# Run tests
npm test

# Manual testing
npm start
# Test all upgrade flows per UPGRADE_FLOWS_TEST_PLAN.md
```

### Merge
```bash
git checkout main
git merge copilot/implement-upgrade-ux-flows
git push origin main
```

---

## Step-by-Step: Resolving PR #40 Conflicts

### 1. Rebase on Updated Main
```bash
git checkout copilot/add-monetization-upgrades
git pull origin main  # Get latest main with PR #26 merged
git rebase main
```

### 2. Expected Conflicts

#### File: `app.js`

**Conflict 1: State initialization (around line 42)**
```javascript
// KEEP BOTH - Merge all state variables
const state = {
  // ... existing state ...
  
  // From PR #26:
  partyPassWarningShown: false,
  isProMonthly: false,
  
  // From PR #40 (ADD THESE):
  partyPassExtensions: 0,
  activeDjPack: null,
  crowdEnergy: 50,
  djMoments: [],
  totalReactions: 0
};
```

**Conflict 2: Timer logic (around line 641)**
```javascript
// KEEP PR #26's warning logic, ADD PR #40's features
function updatePartyPassTimer() {
  // ... PR #26 base logic ...
  
  // Show warning modal when 10 minutes remaining
  const tenMinutes = 10 * 60 * 1000;
  if (remaining <= tenMinutes && !state.partyPassWarningShown) {
    openPartyPassWarning();
  }
  
  // ... rest of function ...
}
```

**Conflict 3: Modal functions (around line 804)**
```javascript
// KEEP ALL - Rename to avoid collisions
// PR #26 modals:
function openPartyPassUnlock() { show("modalPartyPassUnlock"); }
function closePartyPassUnlock() { hide("modalPartyPassUnlock"); }
// ... etc ...

// PR #40 modals (ADD WITH DIFFERENT NAMES):
function openDJMoments() { show("modalDJMoments"); }
function closeDJMoments() { hide("modalDJMoments"); }
// ... etc ...
```

#### File: `index.html`

**Conflict: Modal structures**
```html
<!-- KEEP ALL MODALS - Ensure unique IDs -->

<!-- PR #26 modals -->
<div class="modal hidden" id="modalPartyPassUnlock">...</div>
<div class="modal hidden" id="modalPartyPassWarning">...</div>
<!-- ... etc ... -->

<!-- PR #40 modals (ADD THESE) -->
<div class="modal hidden" id="modalDJMoments">...</div>
<div class="modal hidden" id="modalCrowdEnergy">...</div>
<!-- ... etc ... -->
```

#### File: `styles.css`

**Conflict: Upgrade modal styles**
```css
/* MERGE - Keep both, PR #40 extends PR #26 */
.upgrade-modal {
  /* PR #26 base styles */
  text-align: center;
  max-width: 480px;
}

/* PR #40 additions */
.dj-moment-card {
  /* New styles for DJ Mode */
}
```

### 3. Resolve and Continue
```bash
# After resolving each conflict:
git add <file>

# Continue rebase:
git rebase --continue

# If stuck:
git rebase --abort  # Start over
```

### 4. Test After Rebase
```bash
npm test  # Should pass all 83 tests
npm start
# Manual testing of ALL features
```

### 5. Push and Merge
```bash
git push origin copilot/add-monetization-upgrades --force
# Create new PR or update existing
```

---

## Step-by-Step: Resolving PR #41 Conflicts

### 1. Rebase on Main (with #26 and #40 merged)
```bash
git checkout copilot/add-monetization-features
git pull origin main
git rebase main
```

### 2. Expected Conflicts

#### File: `app.js`

**Conflict 1: State variables**
```javascript
const state = {
  // ... from PR #26 and #40 ...
  
  // From PR #41 (ADD UNIQUE ONES ONLY):
  hostGiftedPass: false,     // NEW - keep
  extensionShown: false,     // DUPLICATE - remove
  activeDJPack: null,        // DUPLICATE - already in #40
  ownedDJPacks: [],          // NEW - keep
  activeMicroUnlocks: [],    // NEW - keep
  guestBoosts: [],           // NEW - keep
  djLevel: 1,                // NEW - keep
  djXP: 0,                   // NEW - keep
  partyHighlights: [],       // NEW - keep
  limitedOffers: []          // NEW - keep
};
```

**Conflict 2: DJ Packs**
```javascript
// PR #40 has DJ Packs as part of Pro Monthly
// PR #41 has DJ Packs as purchasable items
// DECISION NEEDED: Are these the same feature?

// OPTION A: Keep #40's version (free with Pro)
// Remove DJ Pack purchase code from #41

// OPTION B: Keep both
// #40 = Free packs for Pro users
// #41 = Purchasable packs for non-Pro users
// Merge logic to check Pro status before purchase
```

**Conflict 3: Pricing**
```javascript
// RESOLVE PRICING INCONSISTENCY
// PR #26/#40: Party Pass = £2.99
// PR #41: Host-Gifted Party Pass = £4.99

// DECISION:
// - Are these different products?
// - Or is £4.99 an error?

// IF DIFFERENT:
const PARTY_PASS_PRICE = 2.99;      // Individual
const HOST_GIFTED_PRICE = 4.99;     // Host pays for everyone

// IF SAME:
const PARTY_PASS_PRICE = 2.99;      // Use consistent price
```

### 3. Add Missing Tests
```bash
# PR #41 has NO tests - add before merging
# Create app.test.js additions for:
# - Host-Gifted Pass activation
# - Guest boost approval
# - DJ XP system
# - Limited-time offers
# - Party memories
# - Micro-unlocks
```

### 4. Resolve and Test
```bash
git add <file>
git rebase --continue
npm test  # Should pass
npm start  # Manual testing
```

---

## Conflict Resolution Cheat Sheet

### When to KEEP
- ✅ Unique state variables
- ✅ Unique modal functions  
- ✅ Unique feature logic
- ✅ All test files

### When to REMOVE
- ❌ Duplicate state variables (same name, same purpose)
- ❌ Duplicate modal IDs
- ❌ Duplicate button IDs
- ❌ Overlapping CSS classes with identical rules

### When to MERGE
- 🔀 State initialization (combine all unique variables)
- 🔀 CSS styles (keep all unique classes)
- 🔀 Modal collections (ensure unique IDs)
- 🔀 Event listeners (ensure unique targets)

---

## Testing Checklist After Each Merge

### Automated Tests
```bash
npm test              # All tests pass?
npm run lint          # No lint errors?
```

### Manual Tests - Core Functionality
- [ ] Start a party (free tier)
- [ ] Play/pause music
- [ ] Add a phone
- [ ] Join as guest
- [ ] Leave party

### Manual Tests - PR #26 Features
- [ ] Party Pass unlock modal appears
- [ ] Party Pass activation works
- [ ] Timer counts down correctly
- [ ] 10-minute warning appears
- [ ] Party Pass expiry works
- [ ] Pro Monthly activation works

### Manual Tests - PR #40 Features (if merged)
- [ ] DJ Moments work
- [ ] Crowd Energy updates
- [ ] DJ Packs apply themes
- [ ] Tier-based messaging works
- [ ] All 27 new tests pass

### Manual Tests - PR #41 Features (if merged)
- [ ] Host-Gifted Pass works
- [ ] Guest boosts work
- [ ] DJ XP increases
- [ ] Limited-time offers display
- [ ] Party memories save

---

## Common Issues & Solutions

### Issue: "Cannot merge - conflicts in app.js"
**Solution:** Follow step-by-step guide above for each file

### Issue: "Tests failing after merge"
**Solution:** 
1. Check for duplicate event listeners
2. Verify all button IDs are unique
3. Ensure state variables initialized properly

### Issue: "Modal not appearing"
**Solution:**
1. Check HTML for modal with correct ID
2. Verify `show()` function called
3. Check CSS for `.hidden` class

### Issue: "Timer not working"
**Solution:**
1. Verify `updatePartyPassTimer()` called
2. Check interval is set correctly
3. Ensure `state.partyPassEndTime` is set

---

## Emergency Rollback

If merge causes critical issues:

```bash
# Find commit hash before merge
git log --oneline

# Revert to that commit
git reset --hard <commit-hash>

# Force push (CAUTION)
git push origin main --force
```

---

## Need Help?

1. Review full analysis in `PR_REVIEW_SUMMARY.md`
2. Check test plans in each PR
3. Ask @evansian456-alt for product decisions
4. Create new issue for technical questions

---

**Last updated:** 2026-01-30  
**For:** PRs #26, #40, #41 conflict resolution
