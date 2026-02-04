-- SyncSpeaker Database Schema
-- PostgreSQL 12+

-- Enable extensions (optional but useful)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  dj_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verify_token TEXT,
  reset_password_token TEXT,
  reset_password_expires TIMESTAMPTZ
);

-- SUBSCRIPTIONS (Pro)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','trialing')),
  provider TEXT NOT NULL DEFAULT 'simulated',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- DJ PROFILE (rank, score, cosmetics currently active)
CREATE TABLE IF NOT EXISTS dj_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dj_score INT NOT NULL DEFAULT 0,
  dj_rank TEXT NOT NULL DEFAULT 'Bedroom DJ',
  active_visual_pack TEXT,     -- e.g. 'neon', 'club', 'pulse'
  active_title TEXT,           -- e.g. 'Rising DJ'
  active_background TEXT,      -- optional future
  verified_badge BOOLEAN NOT NULL DEFAULT FALSE,
  crown_effect BOOLEAN NOT NULL DEFAULT FALSE,
  animated_name BOOLEAN NOT NULL DEFAULT FALSE,
  reaction_trail BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OWNED ITEMS (permanent entitlements)
-- Item categories: visual_pack, profile_upgrade, dj_title
CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('visual_pack','profile_upgrade','dj_title')),
  item_key TEXT NOT NULL, -- e.g. 'neon_pack', 'verified_badge', 'legend_title'
  owned BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_key)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);

-- PURCHASE HISTORY (audit log)
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_kind TEXT NOT NULL CHECK (purchase_kind IN ('permanent','party_temp','subscription')),
  item_type TEXT NOT NULL,       -- e.g. 'visual_pack','party_pass','party_extension','remove_ads_party'
  item_key TEXT NOT NULL,        -- e.g. 'neon_pack','party_pass_2h','add_30m'
  price_gbp NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  party_code TEXT,               -- if this purchase attaches to a party
  expires_at TIMESTAMPTZ,        -- for party temp items
  provider TEXT NOT NULL DEFAULT 'simulated',
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_party ON purchases(party_code);

-- PARTY MEMBERSHIP (optional, for "return to party" + analytics)
CREATE TABLE IF NOT EXISTS party_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_code TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('host','guest')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_party_memberships_party ON party_memberships(party_code);
CREATE INDEX IF NOT EXISTS idx_party_memberships_user ON party_memberships(user_id);

-- GUEST PROFILES (track guest contribution points and ranking)
CREATE TABLE IF NOT EXISTS guest_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_identifier TEXT UNIQUE NOT NULL, -- localStorage ID or user_id
  nickname TEXT,
  total_contribution_points INT NOT NULL DEFAULT 0,
  guest_rank TEXT NOT NULL DEFAULT 'Party Newbie',
  parties_joined INT NOT NULL DEFAULT 0,
  total_reactions_sent INT NOT NULL DEFAULT 0,
  total_messages_sent INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_profiles_identifier ON guest_profiles(guest_identifier);
CREATE INDEX IF NOT EXISTS idx_guest_profiles_points ON guest_profiles(total_contribution_points DESC);

-- PARTY SCOREBOARD SESSIONS (persist final scoreboard from each party)
CREATE TABLE IF NOT EXISTS party_scoreboard_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_code TEXT NOT NULL,
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  host_identifier TEXT NOT NULL, -- fallback to localStorage ID if no user_id
  dj_session_score INT NOT NULL DEFAULT 0,
  guest_scores JSONB NOT NULL DEFAULT '[]', -- [{guestId, nickname, points, emojis, messages}]
  party_duration_minutes INT,
  total_reactions INT NOT NULL DEFAULT 0,
  total_messages INT NOT NULL DEFAULT 0,
  peak_crowd_energy INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_party_scoreboard_party ON party_scoreboard_sessions(party_code);
CREATE INDEX IF NOT EXISTS idx_party_scoreboard_host ON party_scoreboard_sessions(host_user_id);
