# How to Resolve PR #97 Merge Conflicts

## Quick Summary
PR #97 has merge conflicts because it's based on an old commit (before PR #96 was merged). Since PR #96 already implemented the same feature, the resolution is to rebase PR #97 onto current main.

## Option 1: Rebase onto Main (Makes PR Mergeable)

```bash
# Checkout PR #97 branch
git fetch origin
git checkout copilot/add-ons-reactions-messages-system

# Rebase onto current main
git reset --hard origin/main

# Force push to update PR
git push -f origin copilot/add-ons-reactions-messages-system
```

**Result:** PR #97 will now be up-to-date with main with 0 changes. It can be merged (but has no effect).

## Option 2: Manual Merge Approach

If force-push is not allowed:

```bash
git checkout copilot/add-ons-reactions-messages-system
git merge origin/main

# During merge conflict resolution:
# - Keep all changes from main (PR #96's implementation)
# - Discard conflicting changes from PR #97
# The unified feed is already implemented in main

git add .
git commit -m "Resolve merge conflicts - keep PR #96 implementation"
git push origin copilot/add-ons-reactions-messages-system
```

## Option 3: Cherry-Pick Unique Changes Only

If there are specific unique improvements from PR #97 to keep:

```bash
# Start fresh from main
git checkout main
git pull origin main
git checkout -b pr97-unique-changes

# Review PR #97 commits and cherry-pick only unique changes
git log copilot/add-ons-reactions-messages-system --oneline

# Example: if commit abc123 has unique labeling changes
git cherry-pick abc123

# Resolve conflicts, keeping PR #96's core implementation
# but adding unique UX improvements from PR #97

git push origin pr97-unique-changes
```

## Verification After Resolution

After resolving, verify the PR status:

```bash
# Check if branch is up to date
git log main..copilot/add-ons-reactions-messages-system

# Should show no commits if using Option 1
# Should show minimal commits if using Option 2/3

# Verify PR status via GitHub API
curl https://api.github.com/repos/evansian456-alt/syncspeaker-prototype/pulls/97 | jq '.mergeable, .mergeable_state'

# Should return: true, "clean"
```

## Recommended Approach

**Use Option 1** - Reset to main:
- ✅ Cleanest solution
- ✅ No conflicts
- ✅ PR becomes immediately mergeable
- ✅ No risk of introducing bugs
- ⚠️ PR will have 0 changes (but that's correct since feature is already merged)

## What Happens When You Merge

After resolving conflicts and merging PR #97:
- No code changes (PR #96 already implemented everything)
- No new features
- Clean merge history
- PR #97 can be closed as merged

## Alternative: Close PR Without Merging

If a merge is not strictly necessary:
1. Comment on PR #97: "Superseded by PR #96"
2. Close the PR
3. Done - no merge needed

This is the **recommended approach** since PR #96 is already merged.
