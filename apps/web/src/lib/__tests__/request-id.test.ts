import { generateRequestId } from '@/lib/request-id';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateRequestId', () => {
  describe('format', () => {
    it('returns a string', () => {
      const id = generateRequestId();
      expect(typeof id).toBe('string');
    });

    it('returns an 8-character string', () => {
      const id = generateRequestId();
      expect(id).toHaveLength(8);
    });

    it('contains only valid hex characters and hyphens (UUID fragment)', () => {
      // A UUID is formatted as xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      // The first 8 characters are hex digits only (no hyphens).
      const id = generateRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('uniqueness', () => {
    it('generates unique IDs across multiple calls', () => {
      const ids = new Set<string>();
      const count = 100;

      for (let i = 0; i < count; i++) {
        ids.add(generateRequestId());
      }

      // With 8 hex chars (4 billion possibilities), 100 IDs should all be unique.
      expect(ids.size).toBe(count);
    });

    it('two consecutive calls return different values', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('edge cases', () => {
    it('does not return an empty string', () => {
      const id = generateRequestId();
      expect(id.length).toBeGreaterThan(0);
    });

    it('generates IDs rapidly without errors', () => {
      const ids: string[] = [];
      for (let i = 0; i < 1000; i++) {
        ids.push(generateRequestId());
      }
      expect(ids).toHaveLength(1000);
      ids.forEach((id) => {
        expect(id).toHaveLength(8);
      });
    });
  });
});
