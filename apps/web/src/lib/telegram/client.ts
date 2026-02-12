// ---------------------------------------------------------------------------
// Telegram Bot API client – thin wrapper around fetch.
// ---------------------------------------------------------------------------

const TELEGRAM_API = 'https://api.telegram.org';

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  return token;
}

function apiUrl(method: string): string {
  return `${TELEGRAM_API}/bot${getBotToken()}/${method}`;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Send a text message to a Telegram chat.
 * Supports Markdown formatting by default.
 */
export async function sendMessage(
  chatId: string,
  text: string,
  parseMode: 'Markdown' | 'HTML' | '' = 'Markdown',
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  const res = await fetch(apiUrl('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[telegram/sendMessage] failed:', err);
  }
}

/**
 * Show a "typing…" indicator in the chat.
 */
export async function sendChatAction(
  chatId: string,
  action: 'typing' = 'typing',
): Promise<void> {
  await fetch(apiUrl('sendChatAction'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

/**
 * Register a webhook URL with Telegram.
 */
export async function setWebhook(url: string): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(apiUrl('setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  return res.json() as Promise<{ ok: boolean; description?: string }>;
}

/**
 * Unregister the current webhook.
 */
export async function deleteWebhook(): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(apiUrl('deleteWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  return res.json() as Promise<{ ok: boolean; description?: string }>;
}
