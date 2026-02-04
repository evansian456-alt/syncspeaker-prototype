# Leaderboard and Profile Features - User Guide

## Overview
Two new features have been added to PHONE PARTY to track and display DJ/Guest performance:

1. **🏆 Leaderboard** - View top-performing DJs and most active guests
2. **👤 My Profile** - View your personal stats, tier, and owned items

## Accessing the Features

### From the Header
Look for these new buttons in the top-right of the app:
- **🏆 Leaderboard** - Click to view rankings
- **👤 My Profile** - Click to view your profile

## Leaderboard

### What You'll See
- **Top DJs Tab** (default view)
  - Ranked list of DJs by lifetime score
  - Top 3 get special medals: 🥇 🥈 🥉
  - Shows: Rank, DJ name, DJ rank/title, total score
  
- **Top Guests Tab**
  - Ranked list of guests by contribution points
  - Top 3 get special medals: 🥇 🥈 🥉
  - Shows: Rank, Guest nickname, parties joined, total points

### How Rankings Work

#### DJ Score
DJs earn points by:
- Hosting parties (session score)
- Total reactions received from guests
- Total messages from guests
- Party duration
- Peak crowd energy

#### Guest Points
Guests earn contribution points by:
- Sending emoji reactions
- Sending messages
- Participating actively in parties

### Switching Between Tabs
Click the "Top DJs" or "Top Guests" button to switch views.

## My Profile

### What You'll See

#### Header Section
- Your DJ name (or "Guest DJ" if anonymous)
- Your tier badge (FREE, PARTY_PASS, or PRO)

#### DJ Stats
- **DJ Score**: Your lifetime accumulated points
- **DJ Rank**: Your earned title (e.g., "Bedroom DJ", "Club DJ")

#### Profile Upgrades
Shows status (✅ or ❌) for:
- Verified Badge
- Crown Effect
- Animated Name
- Reaction Trail

#### Active Customizations
- Visual Pack: Currently equipped visual theme
- Title: Currently equipped DJ title

#### Owned Items
List of all items you've purchased or unlocked through the store.

### For Anonymous Users
If you're not logged in, you'll see:
- DJ Name: "Guest DJ"
- Tier: FREE
- All upgrades: ❌ (off)
- No owned items

## Score Persistence

### When Scores Are Saved
Your scores are automatically saved when:
1. You end a party (as host)
2. You disconnect from a party (WebSocket closes)
3. Party ends naturally

### What Gets Saved

#### For DJs (Hosts)
- Session score (points from this party)
- Lifetime DJ score (cumulative total)
- Party statistics (duration, reactions, messages)

#### For Guests
- Contribution points earned
- Emoji reactions sent
- Messages sent
- Parties joined count

## Navigation

### Going Back
Each screen has a "Back" button at the bottom to return to the landing page.

### Quick Access
The leaderboard and profile buttons are always visible in the header, so you can check stats anytime.

## Tips

1. **Check leaderboards regularly** to see where you rank
2. **Participate actively** as a guest to climb the rankings
3. **Host longer parties** to earn more DJ points
4. **Upgrade your tier** to unlock more features (see Upgrade Hub ⭐)
5. **Earn achievements** by reaching score milestones

## API Endpoints (Developer Reference)

If you're integrating or testing:

```bash
# Get top 10 DJs
GET /api/leaderboard/djs?limit=10

# Get top 10 guests
GET /api/leaderboard/guests?limit=10

# Get current user profile
GET /api/me
```

## Troubleshooting

### "Loading..." doesn't go away
- Check your internet connection
- Refresh the page
- Ensure the server is running

### "Failed to load leaderboard/profile"
- Server may be down
- Database may be unavailable
- Check browser console for errors

### My score didn't update
- Scores update when party ends
- Try refreshing the page
- Check that you were logged in during the party

### Profile shows "Guest DJ"
- You may not be logged in
- Click the 🔑 Account button to sign in
- Create an account if you don't have one

## Security Note
All user-generated content (names, nicknames) is sanitized to prevent XSS attacks. Your data is safe!
