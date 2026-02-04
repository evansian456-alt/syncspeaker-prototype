# Database Schema

This directory contains the PostgreSQL database schema for Phone Party.

## Schema File

- `schema.sql` - Complete database schema with all tables, indexes, and constraints

## Tables

### users
Stores user account information including email, password, and DJ name.

### subscriptions
Tracks Pro subscription status for users (active, past_due, canceled, trialing).

### dj_profiles
Stores DJ profile information including rank, score, and active cosmetic items.

### entitlements
Tracks permanent items owned by users (visual packs, profile upgrades, DJ titles).

### purchases
Audit log of all purchases made by users (permanent items, party passes, subscriptions).

### party_memberships
Tracks user participation in parties for analytics and "return to party" feature.

## Setup

### Prerequisites

- PostgreSQL 12 or higher
- `uuid-ossp` extension support

### Installation

1. Create a database:
   ```bash
   createdb phoneparty
   ```

2. Apply the schema:
   ```bash
   psql -d phoneparty -f db/schema.sql
   ```

### Configuration

Add PostgreSQL connection details to your `.env` file:

```bash
# PostgreSQL Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/phoneparty
# Or individual settings:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=phoneparty
DB_USER=username
DB_PASSWORD=password
```

## Schema Details

### User Authentication
- Users table with email/password authentication
- Email verification support
- Password reset tokens

### Monetization
- Subscription management (Pro monthly plan)
- Purchase history tracking
- Party Pass and party-level purchases
- Permanent item entitlements

### DJ Features
- DJ profiles with ranks and scores
- Visual packs and cosmetic items
- Profile upgrades (verified badge, crown effect, etc.)

### Party System
- Party membership tracking
- Host and guest roles
- Join/leave timestamps for analytics

## Notes

- All tables use UUID primary keys with automatic generation
- Foreign keys use `ON DELETE CASCADE` for automatic cleanup
- Timestamps use `TIMESTAMPTZ` for timezone-aware storage
- Check constraints ensure data integrity for status fields
