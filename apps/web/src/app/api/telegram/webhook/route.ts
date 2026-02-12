import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramMessage } from '@/lib/telegram/handler';
import { getTenantByTelegramChatId } from '@hour-tracker/database';

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
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/telegram/webhook
 *
 * Receives updates from Telegram. This endpoint is NOT protected by JWT —
 * Telegram calls it directly. Security relies on:
 *   1. Only messages from a registered `telegram_chat_id` are processed.
 *   2. Unregistered chats receive a generic "not connected" message.
 */
export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;

    // We only handle text messages.
    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(update.message.chat.id);
    const text = update.message.text;

    // Skip bot commands we don't handle (e.g. /start from unconnected users).
    if (text === '/start') {
      const tenant = await getTenantByTelegramChatId(chatId);
      if (!tenant) {
        // Import sendMessage lazily to avoid issues if token isn't set.
        const { sendMessage } = await import('@/lib/telegram/client');
        await sendMessage(
          chatId,
          `Welcome! Your chat ID is: ${chatId}\n\nPaste this into your Hour Tracker settings to connect this chat.`,
          '',
        );
        return NextResponse.json({ ok: true });
      }
    }

    // Process the message asynchronously — respond to Telegram immediately
    // to avoid timeout. The handler sends the reply via Telegram API.
    // We use waitUntil-style: fire and don't await in production,
    // but for correctness in dev we await.
    await handleTelegramMessage(chatId, text);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[telegram/webhook] error processing update:', err);
    // Always return 200 to Telegram so it doesn't retry.
    return NextResponse.json({ ok: true });
  }
}
