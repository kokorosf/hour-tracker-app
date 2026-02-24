// ---------------------------------------------------------------------------
// Intent parser – converts Telegram command text into typed action schemas.
// Rejects unknown/unsafe formats early.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Intent types
// ---------------------------------------------------------------------------

export interface HoursIntent {
  type: 'hours';
  period: 'today' | 'week';
}

export interface LogIntent {
  type: 'log';
  /** Total duration in minutes. */
  durationMinutes: number;
  client?: string;
  project?: string;
  task?: string;
  note?: string;
}

export interface RecentIntent {
  type: 'recent';
}

export interface StatusIntent {
  type: 'status';
}

export interface HelpIntent {
  type: 'help';
}

export interface LinkIntent {
  type: 'link';
  email: string;
}

export interface NaturalLanguageIntent {
  type: 'natural_language';
  text: string;
}

export type ParsedIntent =
  | HoursIntent
  | LogIntent
  | RecentIntent
  | StatusIntent
  | HelpIntent
  | LinkIntent
  | NaturalLanguageIntent;

// ---------------------------------------------------------------------------
// Duration parser
// ---------------------------------------------------------------------------

/**
 * Parse a duration string like "1h", "30m", "1h30m", "1h 30m", "90" (minutes).
 * Returns total minutes, or `null` if unparseable.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();

  // Plain number → minutes.
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // e.g. "1.5h"
  const decimalHours = trimmed.match(/^(\d+(?:\.\d+)?)h$/i);
  if (decimalHours) {
    return Math.round(parseFloat(decimalHours[1]!) * 60);
  }

  // e.g. "30m"
  const minutesOnly = trimmed.match(/^(\d+)m$/i);
  if (minutesOnly) {
    return parseInt(minutesOnly[1]!, 10);
  }

  // e.g. "1h30m" or "1h 30m"
  const hoursAndMinutes = trimmed.match(/^(\d+)h\s*(\d+)m$/i);
  if (hoursAndMinutes) {
    return parseInt(hoursAndMinutes[1]!, 10) * 60 + parseInt(hoursAndMinutes[2]!, 10);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Key-value parser for /log command
// ---------------------------------------------------------------------------

/**
 * Parse structured key-value pairs from the /log command body.
 * Format: `<duration> client:Name project:Name task:Name note:Free text`
 *
 * Duration tokens (e.g. "1h", "30m") are collected first, then key:value pairs.
 */
function parseLogBody(body: string): Omit<LogIntent, 'type'> | string {
  const tokens = body.trim().split(/\s+/);
  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === '')) {
    return 'Missing duration. Usage: /log 1h 30m project:Name task:Name';
  }

  // Collect duration tokens (before the first key:value).
  const durationParts: string[] = [];
  let restStart = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    // If it looks like a key:value pair, stop collecting duration.
    if (token.includes(':')) break;
    durationParts.push(token);
    restStart = i + 1;
  }

  const durationStr = durationParts.join(' ');
  const durationMinutes = parseDuration(durationStr);
  if (durationMinutes === null || durationMinutes <= 0) {
    return `Could not parse duration "${durationStr}". Examples: 1h, 30m, 1h30m, 90`;
  }

  if (durationMinutes > 1440) {
    return 'Duration cannot exceed 24 hours (1440 minutes).';
  }

  // Parse key:value pairs from the rest of the tokens.
  const rest = tokens.slice(restStart).join(' ');
  const kvPairs: Record<string, string> = {};
  const kvRegex = /(?:^|\s)(client|project|task|note):(.+?)(?=\s+(?:client|project|task|note):|$)/gi;
  let match;

  while ((match = kvRegex.exec(rest)) !== null) {
    kvPairs[match[1]!.toLowerCase()] = match[2]!.trim();
  }

  return {
    durationMinutes,
    client: kvPairs['client'],
    project: kvPairs['project'],
    task: kvPairs['task'],
    note: kvPairs['note'],
  };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a Telegram message into a structured intent.
 *
 * Recognised commands are parsed into their respective intent types.
 * Everything else falls through to `natural_language` for the Claude handler.
 */
export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();

  // /hours today | /hours week
  const hoursMatch = trimmed.match(/^\/hours\s+(today|week)$/i);
  if (hoursMatch) {
    return { type: 'hours', period: hoursMatch[1]!.toLowerCase() as 'today' | 'week' };
  }

  // /log ...
  if (/^\/log\s+/i.test(trimmed)) {
    const body = trimmed.replace(/^\/log\s+/i, '');
    const result = parseLogBody(body);
    if (typeof result === 'string') {
      // Return as natural language so the handler can send the error.
      // We embed the error in a special way – the handler checks for this.
      return { type: 'natural_language', text: `__PARSE_ERROR__${result}` };
    }
    return { type: 'log', ...result };
  }

  // /recent
  if (/^\/recent$/i.test(trimmed)) {
    return { type: 'recent' };
  }

  // /status
  if (/^\/status$/i.test(trimmed)) {
    return { type: 'status' };
  }

  // /help
  if (/^\/help$/i.test(trimmed)) {
    return { type: 'help' };
  }

  // /link <email>
  const linkMatch = trimmed.match(/^\/link\s+(\S+@\S+\.\S+)$/i);
  if (linkMatch) {
    return { type: 'link', email: linkMatch[1]! };
  }

  // Everything else → natural language (handled by Claude).
  return { type: 'natural_language', text: trimmed };
}
