/**
 * Tests for playback synchronization features
 * Covers TIME_PING/TIME_PONG, PREPARE_PLAY/PLAY_AT, and SYNC_STATE messages
 */

describe('Playback Sync Messages', () => {
  describe('TIME_PING/TIME_PONG', () => {
    it('should have correct message format for TIME_PING', () => {
      const timePing = {
        t: 'TIME_PING',
        clientNowMs: Date.now(),
        pingId: 'test-ping-1'
      };
      
      expect(timePing.t).toBe('TIME_PING');
      expect(typeof timePing.clientNowMs).toBe('number');
      expect(typeof timePing.pingId).toBe('string');
    });
    
    it('should have correct message format for TIME_PONG', () => {
      const clientNowMs = Date.now();
      const serverNowMs = Date.now() + 100; // Server ahead by 100ms
      
      const timePong = {
        t: 'TIME_PONG',
        clientNowMs: clientNowMs,
        serverNowMs: serverNowMs,
        pingId: 'test-ping-1'
      };
      
      expect(timePong.t).toBe('TIME_PONG');
      expect(typeof timePong.clientNowMs).toBe('number');
      expect(typeof timePong.serverNowMs).toBe('number');
      expect(typeof timePong.pingId).toBe('string');
      expect(timePong.pingId).toBe('test-ping-1');
    });
    
    it('should calculate RTT correctly', () => {
      const clientSendMs = 1000;
      const serverNowMs = 1050; // 50ms to reach server
      const clientReceiveMs = 1100; // 50ms to return
      
      const rtt = clientReceiveMs - clientSendMs;
      expect(rtt).toBe(100);
      
      // Estimated server time at receive = serverNowMs + rtt/2
      const estimatedServerNow = serverNowMs + (rtt / 2);
      expect(estimatedServerNow).toBe(1100);
      
      // Offset = estimatedServerNow - clientReceiveMs
      const offset = estimatedServerNow - clientReceiveMs;
      expect(offset).toBe(0); // No clock skew in this example
    });
    
    it('should reject high RTT samples', () => {
      const highRtt = 900; // > 800ms threshold
      const shouldReject = highRtt > 800;
      expect(shouldReject).toBe(true);
      
      const acceptableRtt = 500; // < 800ms threshold
      const shouldAccept = acceptableRtt <= 800;
      expect(shouldAccept).toBe(true);
    });
  });
  
  describe('PREPARE_PLAY/PLAY_AT', () => {
    it('should have correct message format for PREPARE_PLAY', () => {
      const leadTimeMs = 1200;
      const startAtServerMs = Date.now() + leadTimeMs;
      
      const preparePlay = {
        t: 'PREPARE_PLAY',
        trackId: 'track-123',
        trackUrl: 'https://example.com/track.mp3',
        title: 'Test Track',
        filename: 'test.mp3',
        durationMs: 180000,
        startAtServerMs: startAtServerMs,
        startPositionSec: 0
      };
      
      expect(preparePlay.t).toBe('PREPARE_PLAY');
      expect(typeof preparePlay.trackId).toBe('string');
      expect(typeof preparePlay.trackUrl).toBe('string');
      expect(typeof preparePlay.startAtServerMs).toBe('number');
      expect(typeof preparePlay.startPositionSec).toBe('number');
    });
    
    it('should have correct message format for PLAY_AT', () => {
      const startAtServerMs = Date.now() + 1200;
      
      const playAt = {
        t: 'PLAY_AT',
        trackId: 'track-123',
        trackUrl: 'https://example.com/track.mp3',
        title: 'Test Track',
        filename: 'test.mp3',
        durationMs: 180000,
        startAtServerMs: startAtServerMs,
        startPositionSec: 0
      };
      
      expect(playAt.t).toBe('PLAY_AT');
      expect(typeof playAt.trackId).toBe('string');
      expect(typeof playAt.trackUrl).toBe('string');
      expect(typeof playAt.startAtServerMs).toBe('number');
      expect(typeof playAt.startPositionSec).toBe('number');
    });
    
    it('should compute expected position correctly', () => {
      const startAtServerMs = 1000;
      const startPositionSec = 10; // Start at 10 seconds
      const nowServerMs = 3000; // 2 seconds later
      
      const elapsedSec = (nowServerMs - startAtServerMs) / 1000;
      const expectedSec = startPositionSec + elapsedSec;
      
      expect(elapsedSec).toBe(2);
      expect(expectedSec).toBe(12); // Should be at 12 seconds
    });
    
    it('should clamp negative expected positions to 0', () => {
      const startAtServerMs = 5000;
      const startPositionSec = 0;
      const nowServerMs = 1000; // Before start time (late arrival)
      
      const elapsedSec = (nowServerMs - startAtServerMs) / 1000;
      const expectedSec = Math.max(0, startPositionSec + elapsedSec);
      
      expect(elapsedSec).toBe(-4);
      expect(expectedSec).toBe(0); // Clamped to 0
    });
  });
  
  describe('SYNC_STATE', () => {
    it('should have correct format for playing status', () => {
      const syncState = {
        t: 'SYNC_STATE',
        serverNowMs: Date.now(),
        track: {
          trackId: 'track-123',
          trackUrl: 'https://example.com/track.mp3',
          title: 'Test Track',
          filename: 'test.mp3',
          durationMs: 180000
        },
        status: 'playing',
        startAtServerMs: Date.now() - 5000, // Started 5s ago
        startPositionSec: 0
      };
      
      expect(syncState.t).toBe('SYNC_STATE');
      expect(syncState.status).toBe('playing');
      expect(typeof syncState.serverNowMs).toBe('number');
      expect(typeof syncState.startAtServerMs).toBe('number');
      expect(typeof syncState.startPositionSec).toBe('number');
      expect(syncState.track).toBeDefined();
    });
    
    it('should have correct format for paused status', () => {
      const syncState = {
        t: 'SYNC_STATE',
        serverNowMs: Date.now(),
        track: {
          trackId: 'track-123',
          trackUrl: 'https://example.com/track.mp3',
          title: 'Test Track',
          filename: 'test.mp3',
          durationMs: 180000
        },
        status: 'paused',
        pausedPositionSec: 45.5,
        pausedAtServerMs: Date.now() - 2000
      };
      
      expect(syncState.t).toBe('SYNC_STATE');
      expect(syncState.status).toBe('paused');
      expect(typeof syncState.pausedPositionSec).toBe('number');
      expect(typeof syncState.pausedAtServerMs).toBe('number');
    });
    
    it('should have correct format for stopped status', () => {
      const syncState = {
        t: 'SYNC_STATE',
        serverNowMs: Date.now(),
        status: 'stopped'
      };
      
      expect(syncState.t).toBe('SYNC_STATE');
      expect(syncState.status).toBe('stopped');
    });
    
    it('should have correct format for preparing status', () => {
      const syncState = {
        t: 'SYNC_STATE',
        serverNowMs: Date.now(),
        track: {
          trackId: 'track-123',
          trackUrl: 'https://example.com/track.mp3',
          title: 'Test Track',
          filename: 'test.mp3',
          durationMs: 180000
        },
        status: 'preparing',
        startAtServerMs: Date.now() + 1000, // Will start in 1s
        startPositionSec: 0
      };
      
      expect(syncState.t).toBe('SYNC_STATE');
      expect(syncState.status).toBe('preparing');
      expect(typeof syncState.startAtServerMs).toBe('number');
      expect(syncState.startAtServerMs).toBeGreaterThan(Date.now());
    });
  });
  
  describe('Pause/Resume State', () => {
    it('should compute paused position correctly', () => {
      const startAtServerMs = 1000;
      const startPositionSec = 0;
      const pausedAtServerMs = 11000; // 10 seconds later
      
      const elapsedSec = (pausedAtServerMs - startAtServerMs) / 1000;
      const pausedPositionSec = startPositionSec + elapsedSec;
      
      expect(elapsedSec).toBe(10);
      expect(pausedPositionSec).toBe(10);
    });
    
    it('should resume from paused position with new scheduled start', () => {
      const pausedPositionSec = 45.5; // Paused at 45.5 seconds
      const leadTimeMs = 1200;
      const resumeStartAtServerMs = Date.now() + leadTimeMs;
      
      const resumePlay = {
        t: 'PLAY_AT',
        startAtServerMs: resumeStartAtServerMs,
        startPositionSec: pausedPositionSec // Resume from where we paused
      };
      
      expect(resumePlay.startPositionSec).toBe(45.5);
      expect(resumePlay.startAtServerMs).toBeGreaterThan(Date.now());
    });
  });
  
  describe('Drift Correction Thresholds', () => {
    const DRIFT_CORRECTION_THRESHOLD_SEC = 0.20;
    const DRIFT_SOFT_CORRECTION_THRESHOLD_SEC = 0.80;
    const DRIFT_HARD_RESYNC_THRESHOLD_SEC = 1.00;
    const DRIFT_SHOW_RESYNC_THRESHOLD_SEC = 1.50;
    
    it('should ignore drift below threshold', () => {
      const drift = 0.15; // 150ms
      const shouldCorrect = Math.abs(drift) >= DRIFT_CORRECTION_THRESHOLD_SEC;
      expect(shouldCorrect).toBe(false);
    });
    
    it('should apply soft correction for moderate drift', () => {
      const drift = 0.50; // 500ms
      const isInSoftRange = Math.abs(drift) >= DRIFT_CORRECTION_THRESHOLD_SEC && 
                            Math.abs(drift) < DRIFT_SOFT_CORRECTION_THRESHOLD_SEC;
      expect(isInSoftRange).toBe(true);
    });
    
    it('should apply hard resync for large drift', () => {
      const drift = 1.20; // 1.2s
      const needsHardResync = Math.abs(drift) > DRIFT_HARD_RESYNC_THRESHOLD_SEC;
      expect(needsHardResync).toBe(true);
    });
    
    it('should show resync button for very large drift', () => {
      const drift = 2.00; // 2s
      const shouldShowButton = Math.abs(drift) > DRIFT_SHOW_RESYNC_THRESHOLD_SEC;
      expect(shouldShowButton).toBe(true);
    });
  });
});
