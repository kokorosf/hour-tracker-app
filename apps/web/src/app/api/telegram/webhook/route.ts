import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramMessage } from '@/lib/telegram/handler';
import {
  getTenantByTelegramChatId,
  ProcessedMessageRepository,
} from '@hour-tracker/database';
import { createRateLimiter } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Telegram Update type (subset we care about)
// ---------------------------------------------------------------------------

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string };
    text?: string;
  };
}

// ---------------------------------------------------------------------------
// Idempotency & rate limiting
// ---------------------------------------------------------------------------

const processedMessageRepo = new ProcessedMessageRepository();

// Per-sender: 30 messages per 60 seconds.
const senderLimiter = createRateLimiter({ limit: 30, windowSeconds: 60 });
// Per-tenant (chat): 120 messages per 60 seconds.
const tenantLimiter = createRateLimiter({ limit: 120, windowSeconds: 60 });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/telegram/webhook
 *
 * Receives updates from Telegram. This endpoint is NOT protected by JWT —
 * Telegram calls it directly. Security relies on:
 *   1. Only messages from a registered `telegram_chat_id` are processed.
 *   2. Unregistered chats receive a generic "not connected" message.
 *   3. Idempotency: duplicate Telegram retries are detected via update_id.
 *   4. Rate limiting: per-sender and per-tenant limits prevent abuse.
 */
export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;

    // We only handle text messages.
    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(update.message.chat.id);
    const senderId = String(update.message.from?.id ?? 'unknown');
    const messageId = String(update.message.message_id);
    const text = update.message.text;

    // --- Rate limiting ---
    const senderBlocked = senderLimiter.check(`tg:sender:${senderId}`);
    if (senderBlocked) {
      // Silently drop — don't send error to avoid feedback loops.
      return NextResponse.json({ ok: true });
    }
    const tenantBlocked = tenantLimiter.check(`tg:chat:${chatId}`);
    if (tenantBlocked) {
      return NextResponse.json({ ok: true });
    }

    // --- Idempotency: skip already-processed updates ---
    const updateKey = String(update.update_id);
    const tenant = await getTenantByTelegramChatId(chatId);
    const isNew = await processedMessageRepo.tryMarkProcessed(
      'telegram',
      updateKey,
      tenant?.id ?? null,
    );
    if (!isNew) {
      // Duplicate update — Telegram retry. Skip.
      return NextResponse.json({ ok: true });
    }

    // --- /start for unconnected chats ---
    if (text === '/start') {
      if (!tenant) {
        const { sendMessage } = await import('@/lib/telegram/client');
        await sendMessage(
          chatId,
          `Welcome! Your chat ID is: ${chatId}\n\nPaste this into your Hour Tracker settings to connect this chat.`,
          '',
        );
        return NextResponse.json({ ok: true });
      }
    }

    // --- Process the message ---
    await handleTelegramMessage(chatId, senderId, text, messageId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[telegram/webhook] error processing update:', err);
    // Always return 200 to Telegram so it doesn't retry.
    return NextResponse.json({ ok: true });
  }
}
