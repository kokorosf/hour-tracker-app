import { getPool } from '../connection';

export class ProcessedMessageRepository {
  /**
   * Attempt to mark a message as processed.
   *
   * Returns `true` if the message was newly inserted (first time processing).
   * Returns `false` if it already exists (duplicate / Telegram retry).
   */
  async tryMarkProcessed(
    channel: string,
    messageId: string,
    tenantId: string | null,
  ): Promise<boolean> {
    const sql = `
      INSERT INTO processed_messages (channel, message_id, tenant_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (channel, message_id) DO NOTHING
    `;
    const result = await getPool().query(sql, [channel, messageId, tenantId]);
    // rowCount === 1 means the row was inserted (new message).
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Clean up processed messages older than the given number of days.
   * Should be called periodically (e.g. daily cron).
   */
  async cleanupOlderThan(days: number): Promise<number> {
    const sql = `
      DELETE FROM processed_messages
       WHERE processed_at < now() - ($1 || ' days')::interval
    `;
    const result = await getPool().query(sql, [days]);
    return result.rowCount ?? 0;
  }
}
