import NextAuth from 'next-auth';
import { authConfig } from './config';
import type { ExtendedSession } from '@hour-tracker/types';

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/**
 * Get the current session on the server (RSC, Server Actions, Route Handlers).
 *
 * Returns `null` when the user is not authenticated.
 */
export async function getServerSession(): Promise<ExtendedSession | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session as unknown as ExtendedSession;
}

/**
 * Re-export `auth` for middleware usage.
 */
export { authConfig } from './config';
