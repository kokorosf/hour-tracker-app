import { getProjectColor } from '@/lib/utils/colors';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getProjectColor', () => {
  describe('determinism', () => {
    it('returns the same color for the same project ID', () => {
      const color1 = getProjectColor('project-abc');
      const color2 = getProjectColor('project-abc');

      expect(color1).toEqual(color2);
    });

    it('returns the same color across many invocations', () => {
      const id = 'some-uuid-1234';
      const first = getProjectColor(id);

      for (let i = 0; i < 100; i++) {
        expect(getProjectColor(id)).toEqual(first);
      }
    });
  });

  describe('distribution', () => {
    it('different IDs can produce different colors', () => {
      const ids = [
        'project-1',
        'project-2',
        'project-3',
        'project-4',
        'project-5',
        'alpha',
        'beta',
        'gamma',
        'delta',
        'epsilon',
      ];

      const colors = ids.map((id) => getProjectColor(id));
      const uniqueBgs = new Set(colors.map((c) => c.bg));

      // With 10 distinct inputs and 10 palette entries, we expect at least
      // a few different colors. Getting all the same would indicate a broken hash.
      expect(uniqueBgs.size).toBeGreaterThan(1);
    });

    it('returns colors within the palette of 10 entries', () => {
      // Generate many project IDs and verify every result is from the palette
      const knownBgs = new Set([
        '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
        '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
      ]);
      const knownBorders = new Set([
        '#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626',
        '#db2777', '#0891b2', '#ea580c', '#0d9488', '#4f46e5',
      ]);

      for (let i = 0; i < 200; i++) {
        const color = getProjectColor(`random-id-${i}`);
        expect(knownBgs.has(color.bg)).toBe(true);
        expect(knownBorders.has(color.border)).toBe(true);
      }
    });
  });

  describe('return shape', () => {
    it('returns an object with bg and border string properties', () => {
      const color = getProjectColor('test-id');

      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('border');
      expect(typeof color.bg).toBe('string');
      expect(typeof color.border).toBe('string');
    });

    it('bg and border are valid hex color strings', () => {
      const hexPattern = /^#[0-9a-f]{6}$/;
      const color = getProjectColor('any-id');

      expect(color.bg).toMatch(hexPattern);
      expect(color.border).toMatch(hexPattern);
    });

    it('bg and border are different values (border is typically darker)', () => {
      const color = getProjectColor('some-project');

      expect(color.bg).not.toBe(color.border);
    });
  });

  describe('edge cases', () => {
    it('handles empty string input', () => {
      const color = getProjectColor('');

      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('border');
      expect(typeof color.bg).toBe('string');
      expect(typeof color.border).toBe('string');
    });

    it('handles very long string input', () => {
      const longId = 'x'.repeat(10_000);
      const color = getProjectColor(longId);

      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('border');
    });

    it('handles special characters in input', () => {
      const specialIds = [
        'id-with-spaces and tabs',
        'unicode-\u00e9\u00e8\u00ea',
        'symbols-!@#$%^&*()',
        'newlines-\n\r\t',
        'null-char-\0',
      ];

      for (const id of specialIds) {
        const color = getProjectColor(id);
        expect(color).toHaveProperty('bg');
        expect(color).toHaveProperty('border');
      }
    });

    it('treats different strings differently even when similar', () => {
      const color1 = getProjectColor('abc');
      const color2 = getProjectColor('abd');

      // They may or may not map to different colors, but the function
      // should handle them without error. If they do differ, it shows
      // the hash is sensitive to small input changes.
      expect(color1).toBeDefined();
      expect(color2).toBeDefined();
    });

    it('handles numeric-looking string IDs', () => {
      const color = getProjectColor('12345');
      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('border');
    });

    it('empty string is deterministic too', () => {
      const a = getProjectColor('');
      const b = getProjectColor('');
      expect(a).toEqual(b);
    });
  });
});
