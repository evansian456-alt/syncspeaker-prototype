# E2E Testing Quick Reference Card

## 🚀 Quick Start

```bash
# Install dependencies (first time only)
npm install
npx playwright install chromium

# Run all tests
npm run test:e2e

# Run with visible browser
npm run test:e2e:headed

# Run interactive mode
npm run test:e2e:ui
```

## 📋 Common Commands

| Command | Description |
|---------|-------------|
| `npm run test:e2e` | Run all E2E tests (headless) |
| `npm run test:e2e:headed` | Run with visible browser |
| `npm run test:e2e:ui` | Interactive test UI |
| `npm run test:e2e:report` | View HTML test report |
| `npm run test:e2e:generate-report` | Generate markdown report |

## 🎯 Run Specific Tests

```bash
# Run specific section
npm run test:e2e -- e2e-tests/00-prechecks.spec.js
npm run test:e2e -- e2e-tests/01-account-flow.spec.js
npm run test:e2e -- e2e-tests/02-tiers-purchases.spec.js

# Run specific test by name
npm run test:e2e -- --grep "Health endpoints"
npm run test:e2e -- --grep "Register new account"
```

## 🌍 Test Different Environments

```bash
# Test local dev
npm run test:e2e

# Test deployed instance
BASE_URL=https://your-app.railway.app npm run test:e2e

# Test with debug output
DEBUG=pw:api npm run test:e2e
```

## 🔍 Debugging

```bash
# Run with browser visible
npm run test:e2e:headed

# Use Playwright Inspector
PWDEBUG=1 npm run test:e2e

# View trace after failure
npx playwright show-trace test-results/.../trace.zip

# Show browser console
npm run test:e2e:headed -- --debug
```

## 📸 Viewing Results

```bash
# Open HTML report
npm run test:e2e:report

# Screenshots location
test-results/              # Auto screenshots on failure
e2e-tests/screenshots/     # Manual screenshots

# Videos (on failure)
test-results/.../video.webm
```

## 🧪 Test Coverage

| Section | Status | File |
|---------|--------|------|
| 0: Prechecks | ✅ Complete | `00-prechecks.spec.js` |
| 1: Account Flow | ✅ Complete | `01-account-flow.spec.js` |
| 2: Tiers & Purchases | ✅ Complete | `02-tiers-purchases.spec.js` |
| 3: Store Purchases | ⚠️ TODO | - |
| 6: Party Features | ✅ Partial | `06-party-features.spec.js` |

## 📚 Documentation

| File | Description |
|------|-------------|
| `E2E_README.md` | Quick start guide |
| `E2E_TEST_GUIDE.md` | Comprehensive testing guide |
| `E2E_TEST_EXECUTION_REPORT.md` | Test execution report |
| `E2E_IMPLEMENTATION_SUMMARY.md` | Implementation details |

## 🛠️ Utilities

### Helper Functions (`e2e-tests/utils/helpers.js`)
```javascript
const { 
  generateTestEmail,     // Unique test email
  generateDJName,        // Unique DJ name
  clearBrowserStorage,   // Clean state
  takeScreenshot,        // Capture screen
  waitForToast,          // Wait for notification
  delay                  // Timing control
} = require('./utils/helpers');
```

### Multi-Session Fixtures (`e2e-tests/utils/fixtures.js`)
```javascript
const { test } = require('./utils/fixtures');

test('Multi-user test', async ({ hostPage, guest1Page, guest2Page }) => {
  // Each page is a separate isolated session
});
```

## 🔧 Configuration

### Environment Variables
```bash
BASE_URL=http://localhost:8080    # Server URL
DATABASE_URL=postgres://...       # Database (optional)
REDIS_URL=redis://...             # Redis (optional)
```

### Playwright Config (`playwright.config.js`)
- Workers: 1 (sequential)
- Timeout: Default
- Retries: 2 on CI
- Screenshots: On failure
- Video: On failure
- Trace: On failure

## 📝 Writing New Tests

### Basic Test Structure
```javascript
const { test } = require('@playwright/test');
const { expect } = require('@playwright/test');
const { clearBrowserStorage, takeScreenshot } = require('./utils/helpers');

test.describe('My Test Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearBrowserStorage(page);
  });

  test('My test case', async ({ page }) => {
    // Test implementation
    await takeScreenshot(page, 'my_test_step');
    expect(result).toBe(expected);
  });
});
```

### Multi-Session Test
```javascript
const { test } = require('./utils/fixtures');

test('Multi-user test', async ({ hostPage, guest1Page }) => {
  // Host actions
  await hostPage.goto('/');
  
  // Guest actions
  await guest1Page.goto('/');
  
  // Verify interaction
});
```

## ⚠️ Common Issues

### Browser Not Installed
```bash
npx playwright install chromium
```

### Server Not Starting
- Check port 8080 is available
- Verify `npm run dev` works
- Check database connection (optional)

### Tests Timeout
- Increase timeout in `playwright.config.js`
- Check server is responding
- Use `--headed` to see what's happening

### Database Tests Fail
- Tests work without database (limited)
- Set `DATABASE_URL` for full functionality
- Account/purchase tests need database

## 📊 Test Results

### Exit Codes
- `0` - All tests passed ✅
- `1` - Some tests failed ❌

### Viewing Results
```bash
# HTML report (opens in browser)
npm run test:e2e:report

# Console output
npm run test:e2e

# Generate markdown report
npm run test:e2e:generate-report
```

## 🎓 Learn More

- **Playwright Docs**: https://playwright.dev
- **Test Files**: `e2e-tests/*.spec.js`
- **Utilities**: `e2e-tests/utils/`
- **Config**: `playwright.config.js`

## 💡 Tips

1. **Use headed mode** when developing tests
2. **Take screenshots** at important steps
3. **Use unique test data** to avoid conflicts
4. **Clear storage** before each test
5. **Use proper waits** instead of fixed delays
6. **Check artifacts** when tests fail
7. **Use Playwright Inspector** for debugging
8. **Test against deployed instance** before release

## 🔄 CI/CD

### GitHub Actions (example)
```yaml
- name: Install Playwright
  run: npx playwright install chromium

- name: Run E2E Tests
  run: npm run test:e2e
  env:
    BASE_URL: https://your-app.railway.app

- name: Upload Artifacts
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: test-results/
```

## 📞 Support

- Check documentation in project root
- Review test output and screenshots
- Use Playwright Inspector for debugging
- Check test-results directory for artifacts

---

**Last Updated:** 2026-02-03
**Version:** 1.0
