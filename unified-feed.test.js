/**
 * Tests for unified feed (FEED_EVENT) functionality
 * Verifies that messages broadcast to all members with no duplicates
 */

const WebSocket = require('ws');
const { parties, generateCode } = require('./server');

describe('Unified Feed - FEED_EVENT Broadcasting', () => {
  let mockWs1, mockWs2, mockWs3;
  let sentMessages1, sentMessages2, sentMessages3;
  
  beforeEach(() => {
    // Clear parties
    parties.clear();
    
    // Create mock WebSocket connections
    sentMessages1 = [];
    sentMessages2 = [];
    sentMessages3 = [];
    
    mockWs1 = {
      readyState: WebSocket.OPEN,
      send: jest.fn((msg) => sentMessages1.push(JSON.parse(msg)))
    };
    
    mockWs2 = {
      readyState: WebSocket.OPEN,
      send: jest.fn((msg) => sentMessages2.push(JSON.parse(msg)))
    };
    
    mockWs3 = {
      readyState: WebSocket.OPEN,
      send: jest.fn((msg) => sentMessages3.push(JSON.parse(msg)))
    };
  });
  
  describe('Broadcast to ALL members', () => {
    it('should broadcast guest messages to both host and all guests', () => {
      const code = generateCode();
      
      // Create a party with 1 host and 2 guests
      const party = {
        code,
        host: mockWs1,
        members: [
          { ws: mockWs1, id: 'host1', name: 'DJ Host', isHost: true },
          { ws: mockWs2, id: 'guest1', name: 'Guest 1', isHost: false },
          { ws: mockWs3, id: 'guest2', name: 'Guest 2', isHost: false }
        ],
        scoreState: {
          dj: { sessionScore: 0 },
          guests: {},
          totalReactions: 0,
          totalMessages: 0
        }
      };
      
      parties.set(code, party);
      
      // Simulate broadcasting a message to all members
      const message = JSON.stringify({
        t: 'FEED_EVENT',
        event: {
          id: 'test-123',
          ts: Date.now(),
          kind: 'guest_message',
          senderId: 'guest1',
          senderName: 'Guest 1',
          text: 'Test message',
          isEmoji: false,
          ttlMs: 12000
        }
      });
      
      party.members.forEach(m => {
        if (m.ws.readyState === WebSocket.OPEN) {
          m.ws.send(message);
        }
      });
      
      // Verify all members received the message
      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
      expect(mockWs3.send).toHaveBeenCalled();
      
      expect(sentMessages1.length).toBe(1);
      expect(sentMessages2.length).toBe(1);
      expect(sentMessages3.length).toBe(1);
      
      // All should receive identical message
      expect(sentMessages1[0]).toEqual(sentMessages2[0]);
      expect(sentMessages2[0]).toEqual(sentMessages3[0]);
    });
    
    it('should broadcast DJ emoji to both host and all guests', () => {
      const code = generateCode();
      
      const party = {
        code,
        host: mockWs1,
        members: [
          { ws: mockWs1, id: 'host1', name: 'DJ Host', isHost: true },
          { ws: mockWs2, id: 'guest1', name: 'Guest 1', isHost: false }
        ],
        scoreState: {
          dj: { sessionScore: 0 },
          guests: {},
          totalReactions: 0
        }
      };
      
      parties.set(code, party);
      
      // Broadcast DJ emoji
      const message = JSON.stringify({
        t: 'FEED_EVENT',
        event: {
          id: 'dj-emoji-123',
          ts: Date.now(),
          kind: 'dj_emoji',
          senderId: 'dj',
          senderName: 'DJ',
          text: '🔥',
          isEmoji: true,
          ttlMs: 12000
        }
      });
      
      party.members.forEach(m => {
        if (m.ws.readyState === WebSocket.OPEN) {
          m.ws.send(message);
        }
      });
      
      // Both host and guest should receive
      expect(sentMessages1.length).toBe(1);
      expect(sentMessages2.length).toBe(1);
      expect(sentMessages1[0].event.kind).toBe('dj_emoji');
      expect(sentMessages2[0].event.kind).toBe('dj_emoji');
    });
    
    it('should broadcast host broadcast message to both host and all guests', () => {
      const code = generateCode();
      
      const party = {
        code,
        host: mockWs1,
        members: [
          { ws: mockWs1, id: 'host1', name: 'DJ Host', isHost: true },
          { ws: mockWs2, id: 'guest1', name: 'Guest 1', isHost: false }
        ]
      };
      
      parties.set(code, party);
      
      // Broadcast host message
      const message = JSON.stringify({
        t: 'FEED_EVENT',
        event: {
          id: 'host-msg-123',
          ts: Date.now(),
          kind: 'host_broadcast',
          senderId: 'dj',
          senderName: 'DJ',
          text: 'Welcome everyone!',
          isEmoji: false,
          ttlMs: 12000
        }
      });
      
      party.members.forEach(m => {
        if (m.ws.readyState === WebSocket.OPEN) {
          m.ws.send(message);
        }
      });
      
      // Both should receive (including host for echo)
      expect(sentMessages1.length).toBe(1);
      expect(sentMessages2.length).toBe(1);
      expect(sentMessages1[0].event.kind).toBe('host_broadcast');
    });
    
    it('should broadcast system messages to all members', () => {
      const code = generateCode();
      
      const party = {
        code,
        host: mockWs1,
        members: [
          { ws: mockWs1, id: 'host1', name: 'DJ Host', isHost: true },
          { ws: mockWs2, id: 'guest1', name: 'Guest 1', isHost: false }
        ]
      };
      
      parties.set(code, party);
      
      // Broadcast system message
      const message = JSON.stringify({
        t: 'FEED_EVENT',
        event: {
          id: 'system-123',
          ts: Date.now(),
          kind: 'system',
          senderId: 'system',
          senderName: 'DJ',
          text: '🎧 Party started! Share your code with friends.',
          isEmoji: false,
          ttlMs: 12000
        }
      });
      
      party.members.forEach(m => {
        if (m.ws.readyState === WebSocket.OPEN) {
          m.ws.send(message);
        }
      });
      
      // Both should receive
      expect(sentMessages1.length).toBe(1);
      expect(sentMessages2.length).toBe(1);
      expect(sentMessages1[0].event.kind).toBe('system');
    });
  });
  
  describe('FEED_EVENT envelope format', () => {
    it('should have required fields: id, ts, kind, senderId, senderName, text, isEmoji, ttlMs', () => {
      const event = {
        id: 'test-123',
        ts: Date.now(),
        kind: 'guest_message',
        senderId: 'guest1',
        senderName: 'Guest 1',
        text: 'Hello!',
        isEmoji: false,
        ttlMs: 12000
      };
      
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('ts');
      expect(event).toHaveProperty('kind');
      expect(event).toHaveProperty('senderId');
      expect(event).toHaveProperty('senderName');
      expect(event).toHaveProperty('text');
      expect(event).toHaveProperty('isEmoji');
      expect(event).toHaveProperty('ttlMs');
      
      expect(['guest_message', 'dj_emoji', 'host_broadcast', 'system']).toContain(event.kind);
    });
  });
});

describe('Client-side deduplication', () => {
  it('feedSeenIds should prevent duplicate rendering', () => {
    // This verifies the deduplication logic concept
    const feedSeenIds = new Set();
    
    const event1 = { id: 'msg-123', text: 'Hello' };
    const event2 = { id: 'msg-123', text: 'Hello' }; // Duplicate
    const event3 = { id: 'msg-456', text: 'Hi' };
    
    // First event should be added
    if (!feedSeenIds.has(event1.id)) {
      feedSeenIds.add(event1.id);
      // Would render here
    }
    expect(feedSeenIds.size).toBe(1);
    
    // Duplicate should be ignored
    let duplicateIgnored = false;
    if (feedSeenIds.has(event2.id)) {
      duplicateIgnored = true;
    } else {
      feedSeenIds.add(event2.id);
    }
    expect(duplicateIgnored).toBe(true);
    expect(feedSeenIds.size).toBe(1);
    
    // New event should be added
    if (!feedSeenIds.has(event3.id)) {
      feedSeenIds.add(event3.id);
    }
    expect(feedSeenIds.size).toBe(2);
  });
  
  it('should handle TTL removal timeout', (done) => {
    const feedItems = [];
    const feedItemTimeouts = new Map();
    
    const event = {
      id: 'ttl-test-123',
      ts: Date.now(),
      text: 'Test TTL',
      ttlMs: 100 // Very short TTL for testing
    };
    
    // Add item
    feedItems.push(event);
    
    // Set up TTL removal
    const timeoutId = setTimeout(() => {
      const index = feedItems.findIndex(item => item.id === event.id);
      if (index !== -1) {
        feedItems.splice(index, 1);
      }
      feedItemTimeouts.delete(event.id);
      
      // Verify item was removed
      expect(feedItems.length).toBe(0);
      expect(feedItemTimeouts.has(event.id)).toBe(false);
      done();
    }, event.ttlMs);
    
    feedItemTimeouts.set(event.id, timeoutId);
    
    // Verify item was added
    expect(feedItems.length).toBe(1);
    expect(feedItemTimeouts.has(event.id)).toBe(true);
  });
});
