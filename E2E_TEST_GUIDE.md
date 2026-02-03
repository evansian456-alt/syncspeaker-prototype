# End-to-End Test Guide for SyncSpeaker Prototype

## Overview

This document describes the comprehensive end-to-end (E2E) testing system for the SyncSpeaker browser prototype. The tests simulate real human users across multiple browser sessions to validate the entire user journey from registration to party features.

## Test Framework

- **Framework**: Playwright
- **Language**: JavaScript (Node.js)
- **Test Files**: `/e2e-tests/*.spec.js`
- **Configuration**: `playwright.config.js`

## Installation

The required dependencies should already be installed. If not, run:

```bash
npm install
```

To install Playwright browsers:

```bash
npx playwright install chromium
```

## Running Tests

### Run all E2E tests (headless)
```bash
npm run test:e2e
```

### Run with visible browser (headed mode)
```bash
npm run test:e2e:headed
```

### Run with Playwright UI (interactive)
```bash
npm run test:e2e:ui
```

### View test report
```bash
npm run test:e2e:report
```

### Run specific test file
```bash
npx playwright test e2e-tests/00-prechecks.spec.js
```

### Run specific test by name
```bash
npx playwright test --grep "Health endpoints"
```

## Test Structure

### Section 0: Prechecks (`00-prechecks.spec.js`)
Tests the basic health and connectivity of the application:
- ✅ `/health` endpoint returns ok status
- ✅ `/api/health` endpoint returns ok status with Redis info
- ✅ WebSocket connectivity
- ✅ Data reset and clean state verification

### Section 1: Account Flow (`01-account-flow.spec.js`)
Tests user registration, login, and logout:
- ✅ Register new account (Account A - Host DJ)
- ✅ Logout then login again
- ✅ Register Guest Account B
- ✅ Register Guest Account C
- ✅ Entitlement storage verification

### Section 2: Tiers & Purchases (`02-tiers-purchases.spec.js`)
Tests subscription tiers and purchase flows:
- ✅ FREE tier defaults and limitations
- ✅ PARTY PASS purchase (£2.99 / 2 hours)
- ✅ PRO monthly subscription purchase (£9.99/month)
- ✅ Tier entitlements display

### Section 3: Store Purchases (`03-store-purchases.spec.js`)
**TODO**: Tests for purchasing store items:
- Visual packs
- DJ cosmetics (badges, crowns, animated names)
- DJ titles
- Verification across screens

### Section 4: Multi-Device Party (`04-multi-device-party.spec.js`)
**TODO**: Tests for multi-device party features:
- Create party
- Join from separate session
- Sync verification

### Section 5: In-Party Features (`05-in-party-features.spec.js`)
**TODO**: Tests for party interaction features:
- Guest messaging
- Reactions
- Hype system

### Section 6: Party Features (`06-party-features.spec.js`)
Tests party management and multi-user interactions:
- ✅ Create party and join from multiple sessions
- ✅ Test messaging and reactions (placeholder)
- ✅ Leave party and rejoin
- ✅ Verify entitlements in party context

## Test Utilities

### Helpers (`e2e-tests/utils/helpers.js`)
Provides utility functions for tests:
- `waitFor(condition, options)` - Wait for a condition
- `generateTestEmail()` - Generate unique test email
- `generateDJName()` - Generate unique DJ name
- `clearBrowserStorage(page)` - Clear localStorage, sessionStorage, cookies
- `takeScreenshot(page, name)` - Take and save screenshot
- `isVisible(page, selector)` - Check if element is visible
- `waitForToast(page, text)` - Wait for toast message
- `delay(ms)` - Delay execution

### Fixtures (`e2e-tests/utils/fixtures.js`)
Provides multi-session testing capabilities:
- `hostContext` - Separate browser context for host
- `hostPage` - Page for host session
- `guest1Context` - Context for guest 1
- `guest1Page` - Page for guest 1
- `guest2Context` - Context for guest 2
- `guest2Page` - Page for guest 2

## Multi-Session Testing

Tests that require multiple users (e.g., party join) use custom fixtures:

```javascript
const { test } = require('./utils/fixtures');

test('Multi-user test', async ({ hostPage, guest1Page }) => {
  // hostPage and guest1Page are completely separate sessions
  await hostPage.goto('/');
  await guest1Page.goto('/');
  
  // Simulate host creating party
  // Simulate guest joining party
});
```

## Screenshots

Screenshots are automatically captured:
- On test failure (configured in `playwright.config.js`)
- When manually calling `takeScreenshot(page, 'name')`

Screenshots are saved to:
- Test failures: `test-results/` directory
- Manual screenshots: `e2e-tests/screenshots/` directory

## Test Reports

After running tests, view the HTML report:

```bash
npm run test:e2e:report
```

The report includes:
- Test results (pass/fail)
- Screenshots
- Videos (on failure)
- Traces (on failure)

## Configuration

### Environment Variables

Set `BASE_URL` to test against a different server:

```bash
BASE_URL=https://your-app.railway.app npm run test:e2e
```

### Playwright Configuration (`playwright.config.js`)

Key settings:
- `testDir`: `./e2e-tests`
- `workers`: 1 (sequential execution for multi-session tests)
- `fullyParallel`: false
- `webServer`: Automatically starts local server on port 8080

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clear storage before tests
3. **Unique Data**: Use `generateTestEmail()` for unique test accounts
4. **Wait Strategies**: Use proper waits (don't use fixed delays unless necessary)
5. **Screenshots**: Take screenshots at important steps
6. **Assertions**: Use meaningful assertions with good error messages

## Debugging Tests

### Run in headed mode to see what's happening
```bash
npm run test:e2e:headed
```

### Use Playwright Inspector
```bash
PWDEBUG=1 npx playwright test
```

### View trace
After a failed test, open the trace viewer:
```bash
npx playwright show-trace test-results/[test-name]/trace.zip
```

## CI/CD Integration

The tests are configured to run in CI environments:
- Retries: 2 attempts on CI
- Screenshots: Only on failure
- Video: Only on failure
- Trace: Only on failure

## Test Coverage

The E2E tests cover the complete user journey as specified in the test plan:
- [x] Section 0: Prechecks
- [x] Section 1: Account Flow
- [x] Section 2: Tiers & Purchases
- [ ] Section 3: Store Purchases (TODO)
- [ ] Section 4: Multi-Device Party (TODO)
- [ ] Section 5: In-Party Features (TODO)
- [x] Section 6: Party Features (partial)

## Known Limitations

1. **Payment Integration**: Tests mock purchase flows since real payment processing isn't implemented in the test environment
2. **WebSocket**: Tests may run in offline mode if WebSocket isn't available
3. **Redis**: Tests fall back to in-memory storage if Redis isn't available in development

## Future Enhancements

- [ ] Add visual regression testing
- [ ] Add performance testing
- [ ] Add accessibility testing
- [ ] Expand store purchase tests
- [ ] Add comprehensive in-party feature tests
- [ ] Add mobile viewport testing
- [ ] Add cross-browser testing (Firefox, Safari)

## Support

For questions or issues with E2E tests:
1. Check test output and screenshots
2. Review Playwright documentation: https://playwright.dev
3. Check test-results directory for traces and videos
