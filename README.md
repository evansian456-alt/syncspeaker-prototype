# syncspeaker-prototype
Browser prototype for SyncSpeaker

## Getting Started

### Installation
```bash
npm install
```

### Running the Application
```bash
npm start
# or for development
npm run dev
```

The server will start on `http://localhost:8080`

## Testing

This project includes a comprehensive test suite for server-side functions and utilities.

### Running Tests

Run all tests:
```bash
npm test
```

Run tests in watch mode (auto-rerun on file changes):
```bash
npm run test:watch
```

Run tests with coverage report:
```bash
npm run test:coverage
```

### Test Coverage

Current test coverage:
- **56 tests** covering:
  - HTTP endpoints (health check, ping, create party, join party)
  - Static file serving
  - Server-side utilities (party code generation)
  - Client-side utilities (HTML escaping, file size formatting, hashing)

Tests are located in:
- `server.test.js` - HTTP endpoint tests (26 tests)
- `utils.test.js` - Utility function tests (30 tests)

## API Endpoints

### GET /health
Returns server health status
```json
{ "status": "ok" }
```

### GET /api/ping
Ping endpoint for testing connectivity
```json
{ "message": "pong", "timestamp": 1234567890 }
```

### POST /api/create-party
Creates a new party and returns a party code
```json
Response: { "partyCode": "ABC123", "hostId": 1 }
```

### POST /api/join-party
Join an existing party
```json
Request: { "partyCode": "ABC123" }
Response: { "ok": true }
```

## WebSocket API

The application also supports WebSocket connections for real-time party management.

WebSocket message types:
- `CREATE` - Create a new party
- `JOIN` - Join an existing party
- `KICK` - Kick a member (host only)
- `SET_PRO` - Set Pro status
- `ROOM` - Broadcast room state updates
- `ENDED` - Party ended notification

