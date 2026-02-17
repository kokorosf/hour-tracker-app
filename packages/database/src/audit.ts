import { getPool } from './connection';

export interface AuditEntry {
  tenantId: string;
  userId: string | null;
  action: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

/**
 * Write an entry to the audit log.
 *
 * Fire-and-forget — failures are logged but never throw so they don't
 * break the primary operation.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO audit_log
         (tenant_id, user_id, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.tenantId,
        entry.userId,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.beforeData ? JSON.stringify(entry.beforeData) : null,
        entry.afterData ? JSON.stringify(entry.afterData) : null,
      ],
    );
  } catch (err) {
    console.error('[audit] failed to write audit log:', err);
  }
}
