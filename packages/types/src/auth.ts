/**
 * User object stored in the JWT and exposed via `session.user`.
 *
 * Extends the default NextAuth user with tenant and role information
 * so that downstream code can enforce authorization without extra queries.
 */
export interface ExtendedUser {
  /** Database user UUID. */
  id: string;
  /** Email address. */
  email: string;
  /** Tenant this user belongs to. */
  tenantId: string;
  /** `'admin'` or `'user'`. */
  role: 'admin' | 'user';
}

/**
 * Session shape returned by `auth()` / `useSession()`.
 *
 * Mirrors the default NextAuth `Session` but replaces the `user` field
 * with {@link ExtendedUser}.
 */
export interface ExtendedSession {
  user: ExtendedUser;
  expires: string;
}
