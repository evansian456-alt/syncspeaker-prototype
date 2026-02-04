# Phone Party E2E Test Suite - Quick Start

## Prerequisites

Before running E2E tests, ensure:

1. **Dependencies installed**:
   ```bash
   npm install
   ```

2. **Playwright browsers installed**:
   ```bash
   npx playwright install chromium
   ```

3. **Database setup** (optional for full tests):
   - PostgreSQL running locally OR
   - Set `DATABASE_URL` environment variable

4. **Redis setup** (optional - tests work in fallback mode):
   - Redis running locally OR
   - Set `REDIS_URL` environment variable

## Quick Test Commands

### Run all E2E tests
```bash
npm run test:e2e
```

### Run specific test section
```bash
# Section 0: Prechecks
npm run test:e2e -- e2e-tests/00-prechecks.spec.js

# Section 1: Account Flow
npm run test:e2e -- e2e-tests/01-account-flow.spec.js

# Section 2: Tiers & Purchases
npm run test:e2e -- e2e-tests/02-tiers-purchases.spec.js

# Section 6: Party Features
npm run test:e2e -- e2e-tests/06-party-features.spec.js
```

### Run with visible browser (for debugging)
```bash
npm run test:e2e:headed
```

### Run with Playwright UI (interactive mode)
```bash
npm run test:e2e:ui
```

## What Gets Tested

### ✅ Section 0: Prechecks
- Health endpoint verification (`/health`, `/api/health`)
- WebSocket connectivity
- Storage reset and clean state

### ✅ Section 1: Account Flow
- User registration with validation
- Login/logout functionality
- Multi-account creation (Host, Guest1, Guest2)
- Entitlement persistence across sessions

### ✅ Section 2: Tiers & Purchases
- FREE tier defaults and limitations
- PARTY PASS purchase (£2.99/2hr)
- PRO subscription (£9.99/month)
- Tier entitlement display

### ✅ Section 6: Party Features
- Multi-session party creation
- Guest joining from separate session
- Leave and rejoin party
- Entitlement verification in party context

### 🚧 TODO Sections
- Section 3: Store Purchases (visual packs, cosmetics, titles)
- Section 4: Multi-Device Party (full sync testing)
- Section 5: In-Party Features (messaging, reactions, hype)

## Test Results

After running tests:

### View HTML Report
```bash
npm run test:e2e:report
```

### Check Screenshots
- Automatic screenshots on failure: `test-results/` directory
- Manual screenshots: `e2e-tests/screenshots/` directory

### Check Videos (on failure)
- Located in `test-results/` directory

## Environment Variables

### Test against deployed server
```bash
BASE_URL=https://your-app.railway.app npm run test:e2e
```

### Enable debug mode
```bash
DEBUG=pw:api npm run test:e2e
```

### Run with Playwright Inspector
```bash
PWDEBUG=1 npm run test:e2e
```

## Test Architecture

### Multi-Session Testing
Tests use custom fixtures to simulate multiple users:
- `hostPage` - Host DJ session
- `guest1Page` - Guest 1 session
- `guest2Page` - Guest 2 session

Each session is completely isolated with separate:
- Browser contexts
- Cookies
- LocalStorage
- SessionStorage

### Test Data
Tests use dynamic test data generation:
- Unique emails: `test_1738558421234_abc123@syncspeaker.test`
- Unique DJ names: `DJ_Test_xyz789`

### Utilities
Helper functions in `e2e-tests/utils/helpers.js`:
- `generateTestEmail()` - Unique test emails
- `generateDJName()` - Unique DJ names
- `clearBrowserStorage(page)` - Clean slate
- `takeScreenshot(page, name)` - Capture state
- `waitForToast(page, text)` - Wait for notifications

## Debugging Failed Tests

1. **Check test output** for error messages
2. **View screenshots** in `test-results/` directory
3. **Open trace viewer**:
   ```bash
   npx playwright show-trace test-results/.../trace.zip
   ```
4. **Run in headed mode** to see what's happening:
   ```bash
   npm run test:e2e:headed
   ```
5. **Use Playwright Inspector**:
   ```bash
   PWDEBUG=1 npm run test:e2e
   ```

## Known Limitations

### Without Database
- Account registration will fail
- Login/logout tests will fail
- Tier and purchase tests will fail
- Party features may work in offline mode

### Without Redis
- Tests run in fallback mode
- Multi-instance party sync won't work
- Single-instance party features work fine

### Payment Mocking
- Purchase flows use mock/test mode
- Real payment processing not tested
- Entitlements are still verified

## CI/CD Integration

Tests are configured for CI:
- Auto-retry: 2 attempts on failure
- Screenshots: Only on failure
- Videos: Only on failure
- Headless: Always in CI

## Contributing

When adding new E2E tests:

1. Create test file in `e2e-tests/` with pattern `NN-description.spec.js`
2. Use test utilities from `utils/helpers.js`
3. Use fixtures for multi-session tests
4. Add clear test descriptions
5. Take screenshots at important steps
6. Update this README with new test coverage

## Support

- **Playwright Docs**: https://playwright.dev
- **Test Configuration**: `playwright.config.js`
- **Test Guide**: `E2E_TEST_GUIDE.md`
