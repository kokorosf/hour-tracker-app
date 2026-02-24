// ---------------------------------------------------------------------------
// Chat router – maps Telegram sender IDs to app users and loads context.
// ---------------------------------------------------------------------------

import {
  getTenantByTelegramChatId,
  ChatIdentityRepository,
  UserRepository,
} from '@hour-tracker/database';
import type { Tenant, User } from '@hour-tracker/types';

const chatIdentityRepo = new ChatIdentityRepository();
const userRepo = new UserRepository();

// ---------------------------------------------------------------------------
// Session context returned to the handler
// ---------------------------------------------------------------------------

export interface ChatContext {
  tenant: Tenant;
  user: User | null;
  senderId: string;
  chatId: string;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve chat context for a Telegram message.
 *
 * 1. Look up the tenant by chat ID.
 * 2. Look up the user mapping for the sender.
 *
 * Returns `null` when the chat is not connected to any tenant.
 */
export async function resolveChatContext(
  chatId: string,
  senderId: string,
): Promise<ChatContext | null> {
  const tenant = await getTenantByTelegramChatId(chatId);
  if (!tenant) return null;

  // Try to resolve the sender to an app user.
  const mapping = await chatIdentityRepo.findBySender('telegram', senderId);

  let user: User | null = null;
  if (mapping && mapping.tenantId === tenant.id) {
    user = await userRepo.findById(mapping.userId, tenant.id);
  }

  return { tenant, user, senderId, chatId };
}

// ---------------------------------------------------------------------------
// Link / unlink
// ---------------------------------------------------------------------------

/**
 * Link a Telegram sender to an app user.
 *
 * Verifies the email belongs to the tenant, then creates the mapping.
 * Returns the linked user on success, or an error string on failure.
 */
export async function linkSender(
  chatId: string,
  senderId: string,
  email: string,
): Promise<User | string> {
  const tenant = await getTenantByTelegramChatId(chatId);
  if (!tenant) return 'This chat is not connected to any organisation.';

  const user = await userRepo.findByEmail(email, tenant.id);
  if (!user) {
    return `No user with email "${email}" found in ${tenant.name}. Check the email and try again.`;
  }

  await chatIdentityRepo.upsert('telegram', senderId, user.id, tenant.id);
  return user;
}
