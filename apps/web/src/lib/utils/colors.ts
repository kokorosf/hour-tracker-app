/**
 * Deterministic color palette for project-based event coloring.
 *
 * Given a project ID, returns the same color every time so events from
 * the same project are visually grouped on the calendar.
 */

const PROJECT_COLORS = [
  { bg: '#3b82f6', border: '#2563eb' }, // blue
  { bg: '#10b981', border: '#059669' }, // emerald
  { bg: '#f59e0b', border: '#d97706' }, // amber
  { bg: '#8b5cf6', border: '#7c3aed' }, // violet
  { bg: '#ef4444', border: '#dc2626' }, // red
  { bg: '#ec4899', border: '#db2777' }, // pink
  { bg: '#06b6d4', border: '#0891b2' }, // cyan
  { bg: '#f97316', border: '#ea580c' }, // orange
  { bg: '#14b8a6', border: '#0d9488' }, // teal
  { bg: '#6366f1', border: '#4f46e5' }, // indigo
] as const;

/**
 * Hash a string to an index in the palette.
 * Uses a simple djb2 hash for speed and consistency.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function getProjectColor(projectId: string): { bg: string; border: string } {
  const idx = hashString(projectId) % PROJECT_COLORS.length;
  return PROJECT_COLORS[idx];
}
