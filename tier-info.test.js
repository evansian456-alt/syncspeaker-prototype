const request = require('supertest');
const { app } = require('./server');

describe('Party Pass Tier Info', () => {
  describe('GET /api/tier-info', () => {
    it('should return tier information', async () => {
      const response = await request(app).get('/api/tier-info');
      expect(response.status).toBe(200);
      expect(response.body.appName).toBe('Phone Party');
      expect(response.body.tiers).toBeDefined();
      expect(response.body.tiers.FREE).toBeDefined();
      expect(response.body.tiers.PARTY_PASS).toBeDefined();
      expect(response.body.tiers.PRO_MONTHLY).toBeDefined();
    });
    
    it('should have correct FREE tier settings', async () => {
      const response = await request(app).get('/api/tier-info');
      const freeTier = response.body.tiers.FREE;
      expect(freeTier.chatEnabled).toBe(false);
      expect(freeTier.autoMessages).toBe(false);
      expect(freeTier.guestQuickReplies).toBe(false);
      expect(freeTier.hostQuickMessages).toBe(false);
      expect(freeTier.systemAutoMessages).toBe(false);
      expect(freeTier.phoneLimit).toBe(2);
      expect(freeTier.queueLimit).toBe(5);
      expect(Array.isArray(freeTier.notes)).toBe(true);
    });
    
    it('should have correct PARTY_PASS tier settings', async () => {
      const response = await request(app).get('/api/tier-info');
      const partyPass = response.body.tiers.PARTY_PASS;
      expect(partyPass.chatEnabled).toBe(true);
      expect(partyPass.autoMessages).toBe(true);
      expect(partyPass.quickMessages).toBe(true);
      expect(partyPass.guestQuickReplies).toBe(true);
      expect(partyPass.hostQuickMessages).toBe(true);
      expect(partyPass.systemAutoMessages).toBe(true);
      expect(partyPass.maxTextLength).toBe(60);
      expect(partyPass.maxEmojiLength).toBe(10);
      expect(partyPass.messageTtlMs).toBe(12000);
      expect(partyPass.phoneLimit).toBe(4);
      expect(partyPass.queueLimit).toBe(5);
      expect(partyPass.price).toBe('£2.99');
      expect(Array.isArray(partyPass.notes)).toBe(true);
    });
    
    it('should have correct PRO_MONTHLY tier settings', async () => {
      const response = await request(app).get('/api/tier-info');
      const pro = response.body.tiers.PRO_MONTHLY;
      expect(pro.chatEnabled).toBe(true);
      expect(pro.cosmetics).toBe(true);
      expect(pro.profilePerks).toBe(true);
      expect(pro.phoneLimit).toBe(10);
      expect(pro.price).toBe('£9.99/mo');
      expect(Array.isArray(pro.notes)).toBe(true);
    });
  });
});
