import pool from '@/lib/db';

export type AdminAssignee = { id: number; label: string };

export async function fetchActiveAssignees(): Promise<AdminAssignee[]> {
  const res = await pool.query<{ id: number; label: string }>(`
    SELECT id,
           COALESCE(NULLIF(TRIM(display_name), ''), username) AS label
    FROM admin_users
    WHERE is_active = TRUE
    ORDER BY label ASC
  `);
  return res.rows.map((r) => ({ id: Number(r.id), label: String(r.label ?? '') }));
}

export async function resolveAssigneeLabel(adminId: number | null): Promise<string | null> {
  if (adminId == null || !Number.isFinite(adminId) || adminId <= 0) return null;
  const res = await pool.query<{ label: string }>(
    `SELECT COALESCE(NULLIF(TRIM(display_name), ''), username) AS label
     FROM admin_users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [adminId]
  );
  return res.rows[0]?.label ?? null;
}
