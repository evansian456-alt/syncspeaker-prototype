#!/usr/bin/env node

/**
 * SyncSpeaker Smoke Test
 * 
 * Minimal automated test to verify:
 * 1. Server is running
 * 2. Homepage loads and includes "SyncSpeaker"
 * 3. /health endpoint returns 200 with correct JSON
 */

const http = require('http');

// Configuration
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8080;
const BASE_URL = `http://${HOST}:${PORT}`;

let testsPassed = 0;
let testsFailed = 0;

/**
 * Make HTTP request
 */
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    
    http.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Run a test with description
 */
async function test(description, testFn) {
  process.stdout.write(`Testing: ${description}... `);
  
  try {
    await testFn();
    console.log('✅ PASS');
    testsPassed++;
  } catch (err) {
    console.log('❌ FAIL');
    console.error(`  Error: ${err.message}`);
    testsFailed++;
  }
}

/**
 * Assertion helpers
 */
function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message || `Expected to find "${needle}" in response`);
  }
}

function assertIsObject(value, message) {
  if (typeof value !== 'object' || value === null) {
    throw new Error(message || `Expected object, got ${typeof value}`);
  }
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('🚀 Starting SyncSpeaker Smoke Tests\n');
  console.log(`Base URL: ${BASE_URL}\n`);
  
  // Test 1: Homepage loads with 200 and includes "SyncSpeaker"
  await test('GET / returns 200 status', async () => {
    const res = await makeRequest('/');
    assertEquals(res.statusCode, 200, 'Homepage should return 200');
  });
  
  await test('Homepage includes "SyncSpeaker" text', async () => {
    const res = await makeRequest('/');
    assertIncludes(res.body, 'SyncSpeaker', 'Homepage should include "SyncSpeaker"');
  });
  
  await test('Homepage includes HTML structure', async () => {
    const res = await makeRequest('/');
    assertIncludes(res.body, '<!doctype html>', 'Should be valid HTML');
    assertIncludes(res.body, '<title>', 'Should have a title');
  });
  
  // Test 2: Health endpoint returns 200 with correct JSON
  await test('GET /health returns 200 status', async () => {
    const res = await makeRequest('/health');
    assertEquals(res.statusCode, 200, 'Health endpoint should return 200');
  });
  
  await test('GET /health returns valid JSON', async () => {
    const res = await makeRequest('/health');
    let json;
    try {
      json = JSON.parse(res.body);
    } catch (err) {
      throw new Error('Response is not valid JSON');
    }
    assertIsObject(json, 'Response should be a JSON object');
  });
  
  await test('GET /health returns {status:"ok"}', async () => {
    const res = await makeRequest('/health');
    const json = JSON.parse(res.body);
    assertEquals(json.status, 'ok', 'Health status should be "ok"');
  });
  
  // Test 3: Static assets are served
  await test('GET /app.js returns 200 status', async () => {
    const res = await makeRequest('/app.js');
    assertEquals(res.statusCode, 200, 'app.js should be served');
  });
  
  await test('GET /styles.css returns 200 status', async () => {
    const res = await makeRequest('/styles.css');
    assertEquals(res.statusCode, 200, 'styles.css should be served');
  });
  
  // Test 4: API ping endpoint
  await test('GET /api/ping returns 200 status', async () => {
    const res = await makeRequest('/api/ping');
    assertEquals(res.statusCode, 200, 'Ping endpoint should return 200');
  });
  
  await test('GET /api/ping returns valid JSON with message', async () => {
    const res = await makeRequest('/api/ping');
    const json = JSON.parse(res.body);
    assertEquals(json.message, 'pong', 'Ping should return pong');
  });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📝 Total:  ${testsPassed + testsFailed}`);
  console.log('='.repeat(50) + '\n');
  
  // Exit with appropriate code
  if (testsFailed > 0) {
    console.log('⚠️  Some tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
    process.exit(0);
  }
}

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('\n💥 Unhandled error:', err);
  process.exit(1);
});

// Run tests
runTests().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
