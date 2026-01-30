# Testing Notes

## Dependencies

### nanoid v3.3.11 (not v5.x)
The project uses nanoid v3.3.11 instead of the latest v5.x because:
- v5.x is ESM-only (ES Modules)
- v3.x supports CommonJS, which is required for Jest testing
- This project uses CommonJS (`require()` syntax) throughout
- Upgrading to v5.x would require converting the entire codebase to ESM

To keep the project simple and maintain Jest compatibility, we use nanoid v3.

## Test Framework

### Jest 30.2.0
- Configured for Node.js environment
- Using CommonJS module system
- Coverage reporting enabled

### Supertest 7.2.2
- Used for HTTP endpoint testing
- Allows testing Express app without starting a real server

## Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Run with coverage report
```

## Test Organization

- `server.test.js` - HTTP API endpoint tests
- `utils.test.js` - Utility function tests
- `utils.js` - Extracted utility functions (for testability)

## What's NOT Tested

WebSocket functionality is not tested because it requires:
- Complex WebSocket client mocking
- Stateful connection management
- Event-based testing setup

The HTTP REST API provides sufficient test coverage for the core business logic.
