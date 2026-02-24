// ---------------------------------------------------------------------------
// Telegram message handler
//
// Architecture (per integration plan):
//   1. telegram-webhook → receives update
//   2. chat-router      → maps senderId → userId + tenantId
//   3. intent-parser    → parses commands into action schemas
//   4. action-executor  → calls existing Hour Tracker business logic
//   5. response-renderer→ sends concise Telegram reply
//
// Natural-language messages still fall through to the Claude agentic loop.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import { sendMessage, sendChatAction } from './client';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { parseIntent } from './intent-parser';
import { resolveChatContext, linkSender, type ChatContext } from './chat-router';
import {
  executeHours,
  executeLog,
  executeRecent,
  executeStatus,
} from './action-executor';
import { renderResponse, renderHelp } from './response-renderer';

// ---------------------------------------------------------------------------
// Claude client (for natural-language fallback)
// ---------------------------------------------------------------------------

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
  return new Anthropic({ apiKey });
}

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
// Main handler
// ---------------------------------------------------------------------------

const MAX_TOOL_ROUNDS = 10;

/**
 * Handle a Telegram message.
 *
 * Structured commands (/hours, /log, /recent, /status, /help, /link) are
 * parsed and executed directly. All other text is forwarded to Claude.
 */
export async function handleTelegramMessage(
  chatId: string,
  senderId: string,
  messageText: string,
  messageId: string,
): Promise<void> {
  // 1. Resolve chat context (tenant + user).
  const ctx = await resolveChatContext(chatId, senderId);
  if (!ctx) {
    await sendMessage(
      chatId,
      'This chat is not connected to any organisation. Please set up the Telegram integration in your Hour Tracker settings.',
      '',
    );
    return;
  }

  // Show typing indicator.
  await sendChatAction(chatId);

  // 2. Parse the intent.
  const intent = parseIntent(messageText);

  try {
    switch (intent.type) {
      // ------------------------------------------------------------------
      // /help
      // ------------------------------------------------------------------
      case 'help': {
        await sendMessage(chatId, renderHelp(), '');
        return;
      }

      // ------------------------------------------------------------------
      // /link <email>
      // ------------------------------------------------------------------
      case 'link': {
        const result = await linkSender(chatId, senderId, intent.email);
        if (typeof result === 'string') {
          await sendMessage(chatId, result, '');
        } else {
          await sendMessage(
            chatId,
            `Linked! You are now logged in as ${result.email} (${result.role}).`,
            '',
          );
        }
        return;
      }

      // ------------------------------------------------------------------
      // /hours today | /hours week
      // ------------------------------------------------------------------
      case 'hours': {
        const result = await executeHours(intent, ctx);
        await sendMessage(chatId, renderResponse(result), '');
        return;
      }

      // ------------------------------------------------------------------
      // /log <duration> project:... task:... note:...
      // ------------------------------------------------------------------
      case 'log': {
        const result = await executeLog(intent, ctx, messageId);
        await sendMessage(chatId, renderResponse(result), '');
        return;
      }

      // ------------------------------------------------------------------
      // /recent
      // ------------------------------------------------------------------
      case 'recent': {
        const result = await executeRecent(intent, ctx);
        await sendMessage(chatId, renderResponse(result), '');
        return;
      }

      // ------------------------------------------------------------------
      // /status
      // ------------------------------------------------------------------
      case 'status': {
        const result = await executeStatus(intent, ctx);
        await sendMessage(chatId, renderResponse(result), '');
        return;
      }

      // ------------------------------------------------------------------
      // Natural language → Claude
      // ------------------------------------------------------------------
      case 'natural_language': {
        // Check for parse errors from intent-parser.
        if (intent.text.startsWith('__PARSE_ERROR__')) {
          await sendMessage(chatId, intent.text.replace('__PARSE_ERROR__', ''), '');
          return;
        }

        await handleWithClaude(chatId, intent.text, ctx);
        return;
      }
    }
  } catch (err) {
    console.error('[telegram/handler] error:', err);
    await sendMessage(
      chatId,
      'Sorry, something went wrong while processing your message. Please try again.',
      '',
    );
  }
}

// ---------------------------------------------------------------------------
// Claude agentic loop (natural-language fallback)
// ---------------------------------------------------------------------------

async function handleWithClaude(
  chatId: string,
  text: string,
  ctx: ChatContext,
): Promise<void> {
  const anthropic = getAnthropicClient();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: text },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: buildSystemPrompt(ctx.tenant.name),
      tools: TOOL_DEFINITIONS,
      messages,
    });

    // Final text response.
    if (response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      const reply = textBlocks.map((b) => b.text).join('\n') || 'No response.';
      await sendMessage(chatId, reply, '');
      return;
    }

    // Tool calls.
    if (response.stop_reason === 'tool_use') {
      await sendChatAction(chatId);
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(
            block.name,
            block.input as Record<string, string>,
            ctx.tenant.id,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason.
    const fallbackText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    if (fallbackText) {
      await sendMessage(chatId, fallbackText, '');
    }
    return;
  }

  await sendMessage(
    chatId,
    'Sorry, I took too many steps trying to answer that. Please try a simpler question.',
    '',
  );
}
