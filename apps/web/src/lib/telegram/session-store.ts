// ---------------------------------------------------------------------------
// Lightweight in-process session store for pending disambiguation state.
//
// Uses the same Map + periodic eviction pattern as rate-limit.ts.
// Suitable for single-instance deployments. For multi-instance production,
// swap this for a Redis-backed version.
// ---------------------------------------------------------------------------

import type { LogIntent } from './intent-parser';

export type DisambiguationEntity = 'client' | 'project' | 'task';

export interface PendingDisambiguation {
  /** Which entity we're resolving. */
  entity: DisambiguationEntity;
  /** The numbered choices the user was shown. */
  matches: Array<{ name: string; id: string; extra?: string }>;
  /** The original LogIntent — the chosen ID is injected before re-execution. */
  pendingIntent: LogIntent;
  /** The original Telegram message ID — preserved for the audit log. */
  originalMessageId: string;
  /** Epoch ms when this entry expires. */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const store = new Map<string, PendingDisambiguation>();

// Evict expired sessions every 2 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}, 2 * 60_000).unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getPendingDisambiguation(
  senderId: string,
): PendingDisambiguation | null {
  const entry = store.get(senderId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(senderId);
    return null;
  }
  return entry;
}

export function setPendingDisambiguation(
  senderId: string,
  pending: Omit<PendingDisambiguation, 'expiresAt'>,
): void {
  store.set(senderId, { ...pending, expiresAt: Date.now() + SESSION_TTL_MS });
}

export function clearPendingDisambiguation(senderId: string): void {
  store.delete(senderId);
}
