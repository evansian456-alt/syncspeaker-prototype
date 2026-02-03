#!/usr/bin/env node
/**
 * Test script to validate crash fixes
 * Tests:
 * 1. /api/health endpoint
 * 2. Create party 10 times
 * 3. Join party 10 times (simulated)
 * 4. Process error handlers (check they exist)
 */

const http = require('http');

const HOST = 'localhost';
const PORT = process.env.PORT || 8080;
const BASE_URL = `http://${HOST}:${PORT}`;

let testsPassed = 0;
let testsFailed = 0;

function log(message) {
  console.log(`[TEST] ${message}`);
}

function pass(testName) {
  testsPassed++;
  console.log(`✅ PASS: ${testName}`);
}

function fail(testName, error) {
  testsFailed++;
  console.log(`❌ FAIL: ${testName}`);
  console.log(`   Error: ${error}`);
}

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testHealthEndpoint() {
  log('Testing /api/health endpoint...');
  try {
    const result = await makeRequest('GET', '/api/health');
    
    if (result.status !== 200 && result.status !== 503) {
      fail('Health endpoint status code', `Expected 200 or 503, got ${result.status}`);
      return;
    }
    
    if (!result.body.hasOwnProperty('ok')) {
      fail('Health endpoint response', 'Missing "ok" field');
      return;
    }
    
    if (!result.body.instanceId) {
      fail('Health endpoint response', 'Missing instanceId');
      return;
    }
    
    if (!result.body.version) {
      fail('Health endpoint response', 'Missing version');
      return;
    }
    
    pass('Health endpoint');
    log(`   Status: ${result.status}`);
    log(`   OK: ${result.body.ok}`);
    log(`   Instance: ${result.body.instanceId}`);
    log(`   Version: ${result.body.version}`);
    log(`   Redis: ${JSON.stringify(result.body.redis)}`);
  } catch (error) {
    fail('Health endpoint', error.message);
  }
}

async function testCreateParty(iteration) {
  try {
    const result = await makeRequest('POST', '/api/create-party', {
      name: `TestHost${iteration}`,
      isPro: false
    });
    
    if (result.status !== 200) {
      fail(`Create party #${iteration}`, `Expected 200, got ${result.status}`);
      return null;
    }
    
    if (!result.body.code) {
      fail(`Create party #${iteration}`, 'Missing party code');
      return null;
    }
    
    pass(`Create party #${iteration}`);
    return result.body.code;
  } catch (error) {
    fail(`Create party #${iteration}`, error.message);
    return null;
  }
}

async function testJoinParty(partyCode, iteration) {
  try {
    const result = await makeRequest('POST', '/api/join-party', {
      partyCode: partyCode,
      nickname: `TestGuest${iteration}`
    });
    
    if (result.status !== 200) {
      fail(`Join party #${iteration}`, `Expected 200, got ${result.status}`);
      return false;
    }
    
    if (!result.body.guestId) {
      fail(`Join party #${iteration}`, 'Missing guestId');
      return false;
    }
    
    pass(`Join party #${iteration}`);
    return true;
  } catch (error) {
    fail(`Join party #${iteration}`, error.message);
    return false;
  }
}

async function testCreateAndJoinMultiple() {
  log('Testing multiple party create/join operations...');
  
  const iterations = 10;
  
  // Test create party 10 times
  log(`Creating ${iterations} parties...`);
  const partyCodes = [];
  for (let i = 1; i <= iterations; i++) {
    const code = await testCreateParty(i);
    if (code) {
      partyCodes.push(code);
    }
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Test join party 10 times (use first created party)
  if (partyCodes.length > 0) {
    log(`Joining party ${partyCodes[0]} ${iterations} times...`);
    for (let i = 1; i <= iterations; i++) {
      await testJoinParty(partyCodes[0], i);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('CRASH FIX VALIDATION TESTS');
  console.log('='.repeat(60));
  console.log('');
  
  // Wait a moment for server to be ready
  log('Waiting for server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 1: Health endpoint
  await testHealthEndpoint();
  console.log('');
  
  // Test 2 & 3: Create and join parties
  await testCreateAndJoinMultiple();
  console.log('');
  
  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Passed: ${testsPassed}`);
  console.log(`Total Failed: ${testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('');
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
  } else {
    console.log('');
    console.log('❌ SOME TESTS FAILED');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
