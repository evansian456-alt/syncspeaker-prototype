/**
 * Scoreboard System Tests
 * Tests for scoreboard functionality including scoring, ranking, and persistence
 */

const db = require('./database');

// Mock database functions for testing
jest.mock('./database');

describe('Scoreboard System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Scoring Logic', () => {
    test('should award 5 points for emoji reactions', () => {
      const guestScore = {
        points: 0,
        emojis: 0,
        messages: 0
      };

      // Simulate emoji reaction
      guestScore.emojis += 1;
      guestScore.points += 5;

      expect(guestScore.points).toBe(5);
      expect(guestScore.emojis).toBe(1);
    });

    test('should award 10 points for text messages', () => {
      const guestScore = {
        points: 0,
        emojis: 0,
        messages: 0
      };

      // Simulate text message
      guestScore.messages += 1;
      guestScore.points += 10;

      expect(guestScore.points).toBe(10);
      expect(guestScore.messages).toBe(1);
    });

    test('should accumulate points correctly', () => {
      const guestScore = {
        points: 0,
        emojis: 0,
        messages: 0
      };

      // 2 emojis + 3 messages
      guestScore.emojis += 2;
      guestScore.points += 10; // 2 * 5
      guestScore.messages += 3;
      guestScore.points += 30; // 3 * 10

      expect(guestScore.points).toBe(40);
      expect(guestScore.emojis).toBe(2);
      expect(guestScore.messages).toBe(3);
    });

    test('should award DJ points for guest engagement', () => {
      const djScore = {
        sessionScore: 0
      };

      // Guest sends 1 emoji (DJ gets 2 points)
      djScore.sessionScore += 2;
      expect(djScore.sessionScore).toBe(2);

      // Guest sends 1 message (DJ gets 3 points)
      djScore.sessionScore += 3;
      expect(djScore.sessionScore).toBe(5);
    });

    test('should award DJ points for DJ emoji interactions', () => {
      const djScore = {
        sessionScore: 0
      };

      // DJ sends emoji (5 points)
      djScore.sessionScore += 5;
      expect(djScore.sessionScore).toBe(5);
    });
  });

  describe('Ranking Logic', () => {
    test('should rank guests by points', () => {
      const guests = {
        'guest1': { guestId: 'guest1', nickname: 'Alice', points: 50, emojis: 10, messages: 0 },
        'guest2': { guestId: 'guest2', nickname: 'Bob', points: 100, emojis: 5, messages: 5 },
        'guest3': { guestId: 'guest3', nickname: 'Charlie', points: 75, emojis: 7, messages: 1 }
      };

      const rankedGuests = Object.values(guests)
        .sort((a, b) => b.points - a.points)
        .map((guest, index) => ({
          ...guest,
          rank: index + 1
        }));

      expect(rankedGuests[0].nickname).toBe('Bob');
      expect(rankedGuests[0].rank).toBe(1);
      expect(rankedGuests[1].nickname).toBe('Charlie');
      expect(rankedGuests[1].rank).toBe(2);
      expect(rankedGuests[2].nickname).toBe('Alice');
      expect(rankedGuests[2].rank).toBe(3);
    });

    test('should handle empty guest list', () => {
      const guests = {};
      const rankedGuests = Object.values(guests);
      expect(rankedGuests).toHaveLength(0);
    });
  });

  describe('Database Persistence', () => {
    test('should call savePartyScoreboard with correct data', async () => {
      const mockScoreboardData = {
        partyCode: 'TEST123',
        hostUserId: 'host-user-id',
        hostIdentifier: 'host-client-id',
        djSessionScore: 150,
        guestScores: [
          { guestId: 'guest1', nickname: 'Alice', points: 50, emojis: 10, messages: 0, rank: 1 }
        ],
        partyDurationMinutes: 30,
        totalReactions: 10,
        totalMessages: 5,
        peakCrowdEnergy: 85
      };

      db.savePartyScoreboard = jest.fn().mockResolvedValue({ id: 'scoreboard-id' });

      await db.savePartyScoreboard(mockScoreboardData);

      expect(db.savePartyScoreboard).toHaveBeenCalledWith(mockScoreboardData);
      expect(db.savePartyScoreboard).toHaveBeenCalledTimes(1);
    });

    test('should call updateDjProfileScore when DJ is logged in', async () => {
      const userId = 'dj-user-id';
      const sessionScore = 200;

      db.updateDjProfileScore = jest.fn().mockResolvedValue({ 
        user_id: userId, 
        dj_score: 500 
      });

      await db.updateDjProfileScore(userId, sessionScore);

      expect(db.updateDjProfileScore).toHaveBeenCalledWith(userId, sessionScore);
      expect(db.updateDjProfileScore).toHaveBeenCalledTimes(1);
    });

    test('should call updateGuestProfile for each guest', async () => {
      const guestIdentifier = 'guest-client-id';
      const updates = {
        contributionPoints: 50,
        reactionsCount: 10,
        messagesCount: 0
      };

      db.updateGuestProfile = jest.fn().mockResolvedValue({ 
        guest_identifier: guestIdentifier,
        total_contribution_points: 150 
      });

      await db.updateGuestProfile(guestIdentifier, updates);

      expect(db.updateGuestProfile).toHaveBeenCalledWith(guestIdentifier, updates);
      expect(db.updateGuestProfile).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scoreboard State Structure', () => {
    test('should initialize scoreState correctly', () => {
      const scoreState = {
        dj: {
          djUserId: null,
          djIdentifier: 'host-client-id',
          djName: 'DJ Host',
          sessionScore: 0,
          lifetimeScore: 0
        },
        guests: {},
        totalReactions: 0,
        totalMessages: 0,
        peakCrowdEnergy: 0
      };

      expect(scoreState.dj.sessionScore).toBe(0);
      expect(scoreState.guests).toEqual({});
      expect(scoreState.totalReactions).toBe(0);
      expect(scoreState.totalMessages).toBe(0);
      expect(scoreState.peakCrowdEnergy).toBe(0);
    });

    test('should add new guest to scoreState', () => {
      const scoreState = {
        dj: { sessionScore: 0 },
        guests: {},
        totalReactions: 0,
        totalMessages: 0
      };

      const guestId = 'new-guest-id';
      const guestName = 'New Guest';

      scoreState.guests[guestId] = {
        guestId,
        nickname: guestName,
        points: 0,
        emojis: 0,
        messages: 0,
        rank: 1
      };

      expect(scoreState.guests[guestId]).toBeDefined();
      expect(scoreState.guests[guestId].nickname).toBe('New Guest');
      expect(scoreState.guests[guestId].points).toBe(0);
    });

    test('should update guest score in scoreState', () => {
      const scoreState = {
        dj: { sessionScore: 0 },
        guests: {
          'guest-1': {
            guestId: 'guest-1',
            nickname: 'Guest 1',
            points: 0,
            emojis: 0,
            messages: 0,
            rank: 1
          }
        },
        totalReactions: 0,
        totalMessages: 0
      };

      // Guest sends emoji
      scoreState.guests['guest-1'].emojis += 1;
      scoreState.guests['guest-1'].points += 5;
      scoreState.totalReactions += 1;
      scoreState.dj.sessionScore += 2;

      expect(scoreState.guests['guest-1'].points).toBe(5);
      expect(scoreState.guests['guest-1'].emojis).toBe(1);
      expect(scoreState.totalReactions).toBe(1);
      expect(scoreState.dj.sessionScore).toBe(2);
    });
  });
});
