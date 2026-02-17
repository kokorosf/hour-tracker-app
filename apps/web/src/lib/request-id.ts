/**
 * Generate a short, unique request ID for correlating errors across
 * client and server logs.
 */
export function generateRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}
