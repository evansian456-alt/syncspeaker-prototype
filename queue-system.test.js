const request = require('supertest');
const { 
  app, 
  parties, 
  redis, 
  normalizeTrack,
  validateHostAuth,
  loadPartyState,
  savePartyState,
  waitForRedis 
} = require('./server');

describe('Queue System - Backend Tests', () => {
  let testPartyCode;
  let testHostId;

  // Wait for Redis to be ready before running any tests
  beforeAll(async () => {
    try {
      await waitForRedis();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
    }
  });

  // Clear parties and Redis before each test
  beforeEach(async () => {
    parties.clear();
    await redis.flushall();
  });

  describe('Phase 1: normalizeTrack function', () => {
    it('should normalize a complete track object', () => {
      const input = {
        trackId: 'track-123',
        trackUrl: 'https://example.com/track.mp3',
        title: 'Test Song',
        filename: 'test.mp3',
        durationMs: 180000,
        contentType: 'audio/mpeg',
        sizeBytes: 3000000,
        source: 'upload'
      };

      const normalized = normalizeTrack(input, {
        addedBy: { id: 1, name: 'DJ Test' }
      });

      expect(normalized).toMatchObject({
        trackId: 'track-123',
        trackUrl: 'https://example.com/track.mp3',
        title: 'Test Song',
        filename: 'test.mp3',
        durationMs: 180000,
        contentType: 'audio/mpeg',
        sizeBytes: 3000000,
        source: 'upload'
      });
      expect(normalized.addedAt).toBeDefined();
      expect(normalized.addedBy).toEqual({ id: 1, name: 'DJ Test' });
    });

    it('should use filename as title if title is missing', () => {
      const input = {
        trackId: 'track-123',
        trackUrl: 'https://example.com/track.mp3',
        filename: 'awesome-song.mp3'
      };

      const normalized = normalizeTrack(input);
      expect(normalized.title).toBe('awesome-song.mp3');
    });

    it('should default to "Unknown Track" if both title and filename are missing', () => {
      const input = {
        trackId: 'track-123',
        trackUrl: 'https://example.com/track.mp3'
      };

      const normalized = normalizeTrack(input);
      expect(normalized.title).toBe('Unknown Track');
    });

    it('should throw error if trackId is missing', () => {
      const input = {
        trackUrl: 'https://example.com/track.mp3'
      };

      expect(() => normalizeTrack(input)).toThrow('Track must have trackId and trackUrl');
    });

    it('should throw error if trackUrl is missing', () => {
      const input = {
        trackId: 'track-123'
      };

      expect(() => normalizeTrack(input)).toThrow('Track must have trackId and trackUrl');
    });
  });

  describe('Phase 2: validateHostAuth function', () => {
    it('should validate matching hostId', () => {
      const partyData = { hostId: 123 };
      const result = validateHostAuth('123', partyData);
      expect(result.valid).toBe(true);
    });

    it('should reject mismatched hostId', () => {
      const partyData = { hostId: 123 };
      const result = validateHostAuth('456', partyData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Forbidden');
    });

    it('should reject missing hostId', () => {
      const partyData = { hostId: 123 };
      const result = validateHostAuth(null, partyData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject if partyData is missing', () => {
      const result = validateHostAuth('123', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Phase 3: loadPartyState and savePartyState', () => {
    it('should save and load party state', async () => {
      const testCode = 'TEST01';
      const partyData = {
        partyCode: testCode,
        djName: 'Test DJ',
        hostId: 1,
        queue: [{ trackId: 'track-1', title: 'Song 1' }],
        currentTrack: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + 7200000
      };

      await savePartyState(testCode, partyData);
      const loaded = await loadPartyState(testCode);

      expect(loaded).toBeDefined();
      expect(loaded.partyCode).toBe(testCode);
      expect(loaded.djName).toBe('Test DJ');
      expect(loaded.queue).toHaveLength(1);
      expect(loaded.queue[0].trackId).toBe('track-1');
    });

    it('should return null for non-existent party', async () => {
      const loaded = await loadPartyState('NONEXIST');
      expect(loaded).toBeNull();
    });
  });

  describe('Phase 4: Queue Endpoints', () => {
    beforeEach(async () => {
      // Create a test party
      const response = await request(app)
        .post('/api/create-party')
        .send({ djName: 'Test DJ', source: 'local' });
      
      expect(response.status).toBe(200);
      testPartyCode = response.body.partyCode;
      testHostId = response.body.hostId;
    });

    describe('POST /api/party/:code/queue-track', () => {
      it('should queue a track with valid hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            hostId: testHostId,
            trackId: 'track-1',
            trackUrl: '/api/track/track-1',
            title: 'Test Song',
            durationMs: 180000
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.queue).toHaveLength(1);
        expect(response.body.queue[0].trackId).toBe('track-1');
        expect(response.body.queue[0].title).toBe('Test Song');
      });

      it('should reject without hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            trackId: 'track-1',
            trackUrl: '/api/track/track-1',
            title: 'Test Song'
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('hostId');
      });

      it('should reject with invalid hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            hostId: 'wrong-id',
            trackId: 'track-1',
            trackUrl: '/api/track/track-1',
            title: 'Test Song'
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Forbidden');
      });

      it('should enforce queue limit (max 5)', async () => {
        // Add 5 tracks
        for (let i = 1; i <= 5; i++) {
          await request(app)
            .post(`/api/party/${testPartyCode}/queue-track`)
            .send({
              hostId: testHostId,
              trackId: `track-${i}`,
              trackUrl: `/api/track/track-${i}`,
              title: `Song ${i}`
            });
        }

        // Try to add 6th track
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            hostId: testHostId,
            trackId: 'track-6',
            trackUrl: '/api/track/track-6',
            title: 'Song 6'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('full');
      });
    });

    describe('POST /api/party/:code/play-next', () => {
      beforeEach(async () => {
        // Add a track to the queue first
        await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            hostId: testHostId,
            trackId: 'track-1',
            trackUrl: '/api/track/track-1',
            title: 'Test Song',
            durationMs: 180000
          });
      });

      it('should play next track with valid hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/play-next`)
          .send({ hostId: testHostId });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.currentTrack).toBeDefined();
        expect(response.body.currentTrack.trackId).toBe('track-1');
        expect(response.body.queue).toHaveLength(0); // Queue should be empty now
      });

      it('should reject without hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/play-next`)
          .send({});

        expect(response.status).toBe(403);
      });

      it('should fail if queue is empty', async () => {
        // Clear the queue first
        await request(app)
          .post(`/api/party/${testPartyCode}/clear-queue`)
          .send({ hostId: testHostId });

        const response = await request(app)
          .post(`/api/party/${testPartyCode}/play-next`)
          .send({ hostId: testHostId });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('empty');
      });
    });

    describe('POST /api/party/:code/remove-track', () => {
      beforeEach(async () => {
        // Add tracks to the queue
        await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            hostId: testHostId,
            trackId: 'track-1',
            trackUrl: '/api/track/track-1',
            title: 'Song 1'
          });
        await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            hostId: testHostId,
            trackId: 'track-2',
            trackUrl: '/api/track/track-2',
            title: 'Song 2'
          });
      });

      it('should remove a track from queue', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/remove-track`)
          .send({
            hostId: testHostId,
            trackId: 'track-1'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.queue).toHaveLength(1);
        expect(response.body.queue[0].trackId).toBe('track-2');
      });

      it('should reject without hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/remove-track`)
          .send({ trackId: 'track-1' });

        expect(response.status).toBe(403);
      });

      it('should return 404 for non-existent track', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/remove-track`)
          .send({
            hostId: testHostId,
            trackId: 'non-existent'
          });

        expect(response.status).toBe(404);
      });
    });

    describe('POST /api/party/:code/clear-queue', () => {
      beforeEach(async () => {
        // Add tracks to the queue
        await request(app)
          .post(`/api/party/${testPartyCode}/queue-track`)
          .send({
            hostId: testHostId,
            trackId: 'track-1',
            trackUrl: '/api/track/track-1',
            title: 'Song 1'
          });
      });

      it('should clear the queue', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/clear-queue`)
          .send({ hostId: testHostId });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.queue).toHaveLength(0);
      });

      it('should reject without hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/clear-queue`)
          .send({});

        expect(response.status).toBe(403);
      });
    });

    describe('POST /api/party/:code/reorder-queue', () => {
      beforeEach(async () => {
        // Add 3 tracks to the queue
        for (let i = 1; i <= 3; i++) {
          await request(app)
            .post(`/api/party/${testPartyCode}/queue-track`)
            .send({
              hostId: testHostId,
              trackId: `track-${i}`,
              trackUrl: `/api/track/track-${i}`,
              title: `Song ${i}`
            });
        }
      });

      it('should reorder queue tracks', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/reorder-queue`)
          .send({
            hostId: testHostId,
            fromIndex: 0,
            toIndex: 2
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.queue[0].trackId).toBe('track-2');
        expect(response.body.queue[1].trackId).toBe('track-3');
        expect(response.body.queue[2].trackId).toBe('track-1');
      });

      it('should reject without hostId', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/reorder-queue`)
          .send({
            fromIndex: 0,
            toIndex: 1
          });

        expect(response.status).toBe(403);
      });

      it('should reject invalid indices', async () => {
        const response = await request(app)
          .post(`/api/party/${testPartyCode}/reorder-queue`)
          .send({
            hostId: testHostId,
            fromIndex: 0,
            toIndex: 99
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid');
      });
    });
  });

  describe('Phase 6: Party State API', () => {
    beforeEach(async () => {
      // Create a test party
      const response = await request(app)
        .post('/api/create-party')
        .send({ djName: 'Test DJ', source: 'local' });
      
      testPartyCode = response.body.partyCode;
      testHostId = response.body.hostId;

      // Add a track to queue
      await request(app)
        .post(`/api/party/${testPartyCode}/queue-track`)
        .send({
          hostId: testHostId,
          trackId: 'track-1',
          trackUrl: '/api/track/track-1',
          title: 'Test Song'
        });

      // Play the track
      await request(app)
        .post(`/api/party/${testPartyCode}/play-next`)
        .send({ hostId: testHostId });
    });

    it('should return queue and currentTrack in party state', async () => {
      const response = await request(app)
        .get(`/api/party-state?code=${testPartyCode}`);

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(response.body.currentTrack).toBeDefined();
      expect(response.body.currentTrack.trackId).toBe('track-1');
      expect(response.body.queue).toBeDefined();
      expect(Array.isArray(response.body.queue)).toBe(true);
    });
  });
});
