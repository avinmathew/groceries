import { decayScore } from '../lib/frequency';

describe('Frequency Decay', () => {
  const HALF_LIFE_DAYS = 30;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  describe('decayScore', () => {
    it('should return the same score when no time has passed', () => {
      const score = 100;
      const now = new Date();
      const result = decayScore(score, now, now);
      
      expect(result).toBeCloseTo(score, 2);
    });

    it('should decay to approximately 37% after one half-life period (e^-1)', () => {
      const score = 100;
      const lastDecayedAt = new Date('2024-01-01');
      const now = new Date(lastDecayedAt.getTime() + HALF_LIFE_DAYS * MS_PER_DAY);
      
      const result = decayScore(score, lastDecayedAt, now);
      
      // Exponential decay: e^-1 ≈ 0.368
      expect(result).toBeCloseTo(36.79, 1);
    });

    it('should decay to approximately 14% after two half-life periods (e^-2)', () => {
      const score = 100;
      const lastDecayedAt = new Date('2024-01-01');
      const now = new Date(lastDecayedAt.getTime() + 2 * HALF_LIFE_DAYS * MS_PER_DAY);
      
      const result = decayScore(score, lastDecayedAt, now);
      
      // Exponential decay: e^-2 ≈ 0.135
      expect(result).toBeCloseTo(13.53, 1);
    });

    it('should approach zero after many half-life periods', () => {
      const score = 100;
      const lastDecayedAt = new Date('2024-01-01');
      const now = new Date(lastDecayedAt.getTime() + 10 * HALF_LIFE_DAYS * MS_PER_DAY);
      
      const result = decayScore(score, lastDecayedAt, now);
      
      expect(result).toBeLessThan(1);
      expect(result).toBeGreaterThan(0);
    });

    it('should handle zero score', () => {
      const score = 0;
      const lastDecayedAt = new Date('2024-01-01');
      const now = new Date('2024-02-01');
      
      const result = decayScore(score, lastDecayedAt, now);
      
      expect(result).toBe(0);
    });

    it('should handle very small time differences', () => {
      const score = 100;
      const now = new Date();
      const almostNow = new Date(now.getTime() + 1000); // 1 second later
      
      const result = decayScore(score, now, almostNow);
      
      expect(result).toBeCloseTo(score, 1);
    });

    it('should decay linearly for same day (within 24 hours)', () => {
      const score = 100;
      const lastDecayedAt = new Date('2024-01-01T00:00:00');
      const now = new Date('2024-01-01T12:00:00'); // 12 hours later
      
      const result = decayScore(score, lastDecayedAt, now);
      
      // Should decay by approximately half a day's worth
      expect(result).toBeGreaterThan(98);
      expect(result).toBeLessThan(100);
    });
  });
});
