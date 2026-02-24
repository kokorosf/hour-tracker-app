import { getPool } from '../connection';
import { rowToCamel } from './base.repository';

export interface ChatIdentityMapping {
  id: string;
  channel: string;
  senderId: string;
  userId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS =
  'id, channel, sender_id, user_id, tenant_id, created_at, updated_at';

export class ChatIdentityRepository {
  /**
   * Look up the app user linked to a chat sender.
   * Returns `null` when the sender has not been linked yet.
   */
  async findBySender(
    channel: string,
    senderId: string,
  ): Promise<ChatIdentityMapping | null> {
    const sql = `SELECT ${COLUMNS} FROM chat_identity_mappings
                  WHERE channel = $1 AND sender_id = $2`;
    const { rows } = await getPool().query(sql, [channel, senderId]);
    if (rows.length === 0) return null;
    return rowToCamel<ChatIdentityMapping>(rows[0] as Record<string, unknown>);
  }

  /**
   * Create or update the mapping for a chat sender.
   * Uses INSERT … ON CONFLICT to upsert.
   */
  async upsert(
    channel: string,
    senderId: string,
    userId: string,
    tenantId: string,
  ): Promise<ChatIdentityMapping> {
    const sql = `
      INSERT INTO chat_identity_mappings (channel, sender_id, user_id, tenant_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (channel, sender_id)
      DO UPDATE SET user_id = $3, tenant_id = $4, updated_at = now()
      RETURNING ${COLUMNS}
    `;
    const { rows } = await getPool().query(sql, [channel, senderId, userId, tenantId]);
    return rowToCamel<ChatIdentityMapping>(rows[0] as Record<string, unknown>);
  }

  /**
   * Remove a sender's mapping.
   */
  async delete(channel: string, senderId: string): Promise<void> {
    await getPool().query(
      `DELETE FROM chat_identity_mappings WHERE channel = $1 AND sender_id = $2`,
      [channel, senderId],
    );
  }
}
