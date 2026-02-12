// ---------------------------------------------------------------------------
// Telegram message handler – takes a user message, calls Claude with tools,
// and returns a text response.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import { sendMessage, sendChatAction } from './client';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { getTenantByTelegramChatId } from '@hour-tracker/database';

// ---------------------------------------------------------------------------
// Claude client
// ---------------------------------------------------------------------------

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(tenantName: string): string {
  const today = new Date().toISOString().split('T')[0];
  return [
    `You are an assistant for "${tenantName}", a company that uses Hour Tracker to log employee work hours.`,
    `Today's date is ${today}.`,
    '',
    'You can answer questions about employee hours, projects, and clients by calling the available tools.',
    'When the user says "this week", use Monday–Sunday of the current week.',
    'When the user says "last week", use Monday–Sunday of the previous week.',
    'When the user says "this month", use the 1st through today of the current month.',
    '',
    'Format your responses in a clear, readable way. Use plain text — no Markdown bold/italic since this is Telegram.',
    'Keep answers concise but complete.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const MAX_TOOL_ROUNDS = 10;

/**
 * Handle a Telegram message:
 * 1. Look up tenant by chat ID.
 * 2. Show typing indicator.
 * 3. Call Claude with tools.
 * 4. Execute tool calls in a loop until Claude produces a final text.
 * 5. Send the response back to Telegram.
 */
export async function handleTelegramMessage(
  chatId: string,
  messageText: string,
): Promise<void> {
  // Look up the tenant for this chat.
  const tenant = await getTenantByTelegramChatId(chatId);
  if (!tenant) {
    await sendMessage(
      chatId,
      'This chat is not connected to any organisation. Please set up the Telegram integration in your Hour Tracker settings.',
      '',
    );
    return;
  }

  // Show typing.
  await sendChatAction(chatId);

  const anthropic = getAnthropicClient();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: messageText },
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: buildSystemPrompt(tenant.name),
        tools: TOOL_DEFINITIONS,
        messages,
      });

      // If Claude's response ends the conversation (no tool use), send text.
      if (response.stop_reason === 'end_turn') {
        const textBlocks = response.content.filter(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        );
        const text = textBlocks.map((b) => b.text).join('\n') || 'No response.';
        await sendMessage(chatId, text, '');
        return;
      }

      // Process tool calls.
      if (response.stop_reason === 'tool_use') {
        // Keep typing while processing tools.
        await sendChatAction(chatId);

        // Add assistant message with all content blocks.
        messages.push({ role: 'assistant', content: response.content });

        // Execute each tool call and collect results.
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await executeTool(
              block.name,
              block.input as Record<string, string>,
              tenant.id,
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        // Feed tool results back to Claude.
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Unexpected stop reason — send whatever text we have.
      const fallbackText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      if (fallbackText) {
        await sendMessage(chatId, fallbackText, '');
      }
      return;
    }

    // If we hit the max rounds, let the user know.
    await sendMessage(
      chatId,
      'Sorry, I took too many steps trying to answer that. Please try a simpler question.',
      '',
    );
  } catch (err) {
    console.error('[telegram/handler] error:', err);
    await sendMessage(
      chatId,
      'Sorry, something went wrong while processing your message. Please try again.',
      '',
    );
  }
}
