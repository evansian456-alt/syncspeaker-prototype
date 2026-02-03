const { test } = require('./utils/fixtures');
const { expect } = require('@playwright/test');
const { 
  clearBrowserStorage, 
  generateTestEmail, 
  generateDJName,
  takeScreenshot,
  delay
} = require('./utils/helpers');

test.describe('Section 7 - DJ Preset Messages', () => {
  let accounts;
  
  test.beforeAll(() => {
    accounts = {
      host: {
        email: generateTestEmail(),
        djName: generateDJName(),
        password: 'TestPass123!'
      },
      guest1: {
        email: generateTestEmail(),
        djName: generateDJName(),
        password: 'TestPass123!'
      }
    };
  });

  test('7.1 - DJ preset messages hidden for FREE tier', async ({ hostPage }) => {
    // Setup host (FREE tier)
    await hostPage.goto('/');
    await clearBrowserStorage(hostPage);
    
    // Create host account
    await hostPage.evaluate(async (acc) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, accounts.host);
    
    await hostPage.reload();
    await delay(1000);
    
    // Create party
    const partyCode = await hostPage.evaluate(async () => {
      const response = await fetch('/api/create-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          djName: localStorage.getItem('djName') || 'Test DJ'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.code;
      }
      return null;
    });
    
    expect(partyCode).not.toBeNull();
    console.log('✓ Party created with FREE tier, code:', partyCode);
    
    // Check if DJ preset messages section is hidden
    const presetMessagesHidden = await hostPage.evaluate(() => {
      const section = document.getElementById('djPresetMessagesSection');
      return section ? section.classList.contains('hidden') : true;
    });
    
    expect(presetMessagesHidden).toBe(true);
    console.log('✓ DJ preset messages section is hidden for FREE tier');
    
    await takeScreenshot(hostPage, 'dj_preset_messages_free_tier_hidden');
  });

  test('7.2 - DJ preset messages visible for Party Pass tier', async ({ hostPage, guest1Page }) => {
    // Setup host
    await hostPage.goto('/');
    await clearBrowserStorage(hostPage);
    
    // Create host account
    await hostPage.evaluate(async (acc) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, accounts.host);
    
    await hostPage.reload();
    await delay(1000);
    
    // Purchase Party Pass
    await hostPage.evaluate(async () => {
      await fetch('/api/purchase', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          itemId: 'party-pass'
        })
      });
    });
    
    await delay(500);
    
    // Create party with Party Pass
    const partyCode = await hostPage.evaluate(async () => {
      const response = await fetch('/api/create-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          djName: 'Party Pass DJ'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.code;
      }
      return null;
    });
    
    expect(partyCode).not.toBeNull();
    console.log('✓ Party created with Party Pass, code:', partyCode);
    
    // Simulate playing music to show DJ screen
    await hostPage.evaluate(() => {
      // Set state to playing
      if (window.state) {
        window.state.playing = true;
      }
      // Show DJ screen
      const djOverlay = document.getElementById('djScreenOverlay');
      if (djOverlay) {
        djOverlay.classList.remove('hidden');
      }
    });
    
    await delay(500);
    
    // Check if DJ preset messages section is visible
    const presetMessagesVisible = await hostPage.evaluate(() => {
      const section = document.getElementById('djPresetMessagesSection');
      return section ? !section.classList.contains('hidden') : false;
    });
    
    expect(presetMessagesVisible).toBe(true);
    console.log('✓ DJ preset messages section is visible for Party Pass tier');
    
    await takeScreenshot(hostPage, 'dj_preset_messages_party_pass_visible');
  });

  test('7.3 - DJ can send preset messages to guests', async ({ hostPage, guest1Page }) => {
    // Setup host with Party Pass
    await hostPage.goto('/');
    await clearBrowserStorage(hostPage);
    
    await hostPage.evaluate(async (acc) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, accounts.host);
    
    await hostPage.reload();
    await delay(1000);
    
    // Purchase Party Pass
    await hostPage.evaluate(async () => {
      await fetch('/api/purchase', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          itemId: 'party-pass'
        })
      });
    });
    
    // Create party
    const partyCode = await hostPage.evaluate(async () => {
      const response = await fetch('/api/create-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          djName: 'Test DJ'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.code;
      }
      return null;
    });
    
    expect(partyCode).not.toBeNull();
    console.log('✓ Party created, code:', partyCode);
    
    // Setup guest
    await guest1Page.goto('/');
    await clearBrowserStorage(guest1Page);
    
    await guest1Page.evaluate(async (acc) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, accounts.guest1);
    
    await guest1Page.reload();
    await delay(1000);
    
    // Guest joins party
    const joinResult = await guest1Page.evaluate(async (code) => {
      const response = await fetch('/api/join-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          code: code,
          nickname: 'Test Guest'
        })
      });
      
      return response.ok;
    }, partyCode);
    
    expect(joinResult).toBe(true);
    console.log('✓ Guest joined party');
    
    await delay(1000);
    
    // Show DJ screen on host
    await hostPage.evaluate(() => {
      if (window.state) {
        window.state.playing = true;
      }
      const djOverlay = document.getElementById('djScreenOverlay');
      if (djOverlay) {
        djOverlay.classList.remove('hidden');
      }
    });
    
    await delay(500);
    
    // DJ sends a preset message
    const messageSent = await hostPage.evaluate(() => {
      const btn = document.getElementById('btnDjPresetHype');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    
    expect(messageSent).toBe(true);
    console.log('✓ DJ sent preset message');
    
    await delay(1500);
    
    // Check if guest received the message
    const messageReceived = await guest1Page.evaluate(() => {
      const container = document.getElementById('guestDjMessagesContainer');
      if (container) {
        const messages = container.querySelectorAll('.guest-dj-message');
        return messages.length > 0;
      }
      return false;
    });
    
    expect(messageReceived).toBe(true);
    console.log('✓ Guest received DJ preset message');
    
    await takeScreenshot(hostPage, 'dj_sent_preset_message');
    await takeScreenshot(guest1Page, 'guest_received_dj_message');
  });

  test('7.4 - DJ preset messages visible for PRO tier', async ({ hostPage }) => {
    // Setup host with PRO tier
    await hostPage.goto('/');
    await clearBrowserStorage(hostPage);
    
    const proAccount = {
      email: generateTestEmail(),
      password: 'TestPass123!',
      djName: generateDJName()
    };
    
    await hostPage.evaluate(async (acc) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
      }
    }, proAccount);
    
    await hostPage.reload();
    await delay(1000);
    
    // Upgrade to PRO
    await hostPage.evaluate(async () => {
      await fetch('/api/purchase', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          itemId: 'pro-monthly'
        })
      });
    });
    
    // Create party
    const partyCode = await hostPage.evaluate(async () => {
      const response = await fetch('/api/create-party', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          djName: 'PRO DJ'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.code;
      }
      return null;
    });
    
    expect(partyCode).not.toBeNull();
    console.log('✓ Party created with PRO tier, code:', partyCode);
    
    // Show DJ screen
    await hostPage.evaluate(() => {
      if (window.state) {
        window.state.playing = true;
      }
      const djOverlay = document.getElementById('djScreenOverlay');
      if (djOverlay) {
        djOverlay.classList.remove('hidden');
      }
    });
    
    await delay(500);
    
    // Check if DJ preset messages section is visible
    const presetMessagesVisible = await hostPage.evaluate(() => {
      const section = document.getElementById('djPresetMessagesSection');
      return section ? !section.classList.contains('hidden') : false;
    });
    
    expect(presetMessagesVisible).toBe(true);
    console.log('✓ DJ preset messages section is visible for PRO tier');
    
    await takeScreenshot(hostPage, 'dj_preset_messages_pro_tier_visible');
  });
});
