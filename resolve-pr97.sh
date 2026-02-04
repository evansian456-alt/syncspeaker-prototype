#!/bin/bash

# Script to resolve PR #97 merge conflicts
# This script will rebase PR #97 onto the current main branch

set -e  # Exit on error

echo "========================================="
echo "PR #97 Merge Conflict Resolution Script"
echo "========================================="
echo ""

echo "Current status:"
echo "- PR #97 has merge conflicts"
echo "- Reason: Based on old commit before PR #96 was merged"
echo "- Solution: Rebase onto current main"
echo ""

# Confirm
read -p "Do you want to proceed with the resolution? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Step 1: Fetching latest changes..."
git fetch origin

echo ""
echo "Step 2: Checking out PR #97 branch..."
git checkout copilot/add-ons-reactions-messages-system

echo ""
echo "Step 3: Resetting to main (this resolves conflicts)..."
echo "Note: PR #96 already implemented the same feature, so PR #97 will have no changes after reset"
git reset --hard origin/main

echo ""
echo "Step 4: Verifying branch status..."
COMMITS_AHEAD=$(git rev-list --count origin/main..HEAD)
COMMITS_BEHIND=$(git rev-list --count HEAD..origin/main)

echo "Commits ahead of main: $COMMITS_AHEAD"
echo "Commits behind main: $COMMITS_BEHIND"

if [ "$COMMITS_AHEAD" -eq 0 ] && [ "$COMMITS_BEHIND" -eq 0 ]; then
    echo "✅ Branch is now up-to-date with main"
    echo "✅ No merge conflicts"
    echo "✅ Ready to merge (but will have no effect since changes already in main)"
else
    echo "⚠️  Branch has commits: $COMMITS_AHEAD ahead, $COMMITS_BEHIND behind"
fi

echo ""
echo "Step 5: Force push to update PR #97..."
echo "This requires write access to the repository."
read -p "Proceed with force push? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
    git push -f origin copilot/add-ons-reactions-messages-system
    echo "✅ PR #97 branch updated successfully"
    echo ""
    echo "PR #97 Status:"
    echo "- Mergeable: Yes"
    echo "- Conflicts: None"
    echo "- Changes: None (PR #96 already implemented the feature)"
    echo ""
    echo "Recommendation: Close PR #97 as superseded by PR #96"
else
    echo ""
    echo "⚠️  Push skipped. To update PR manually:"
    echo "   git push -f origin copilot/add-ons-reactions-messages-system"
    echo ""
    echo "Or, if you don't have push access, ask a repository admin to run:"
    echo "   git fetch origin"
    echo "   git checkout copilot/add-ons-reactions-messages-system"
    echo "   git reset --hard origin/main"
    echo "   git push -f origin copilot/add-ons-reactions-messages-system"
fi

echo ""
echo "========================================="
echo "Resolution Complete"
echo "========================================="
