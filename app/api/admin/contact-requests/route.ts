import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { fetchActiveAssignees, resolveAssigneeLabel } from '@/lib/admin/assignees';

function parseAssigneeId(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

// GET - получить все заявки (автоматически удаляет старше 24 часов)
export async function GET() {
  const auth = await requireAdminApi('support.forms');
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDatabase();
    // Удаляем записи старше 24 часов
    await pool.query(`
      DELETE FROM contact_requests 
      WHERE created_at < NOW() - INTERVAL '24 hours'
    `);

    const [result, assignees] = await Promise.all([
      pool.query(`
        SELECT cr.*, a.name as auction_name,
               COALESCE(NULLIF(TRIM(au.display_name), ''), au.username) AS assignee_label
        FROM contact_requests cr
        LEFT JOIN auctions a ON cr.auction_id = a.id
        LEFT JOIN admin_users au ON au.id = cr.assignee_admin_id
        ORDER BY cr.created_at DESC
      `),
      fetchActiveAssignees(),
    ]);

    return NextResponse.json({
      assignees,
      requests: result.rows.map((r) => ({
        ...r,
        assignee_admin_id: r.assignee_admin_id != null ? Number(r.assignee_admin_id) : null,
      })),
    });
  } catch (error) {
    console.error('Ошибка получения заявок:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// PATCH - назначить исполнителя
export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApi('support.forms');
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDatabase();
    let body: { id?: number; assigneeAdminId?: number | null };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
    }

    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'ID заявки обязателен' }, { status: 400 });
    }

    const assigneeAdminId = parseAssigneeId(body.assigneeAdminId);
    if (assigneeAdminId != null) {
      const label = await resolveAssigneeLabel(assigneeAdminId);
      if (!label) {
        return NextResponse.json({ error: 'Исполнитель не найден' }, { status: 400 });
      }
    }

    const res = await pool.query(
      `UPDATE contact_requests SET assignee_admin_id = $2 WHERE id = $1 RETURNING id`,
      [id, assigneeAdminId]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка назначения заявки:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE - удалить заявку вручную
export async function DELETE(request: Request) {
  const auth = await requireAdminApi('support.forms');
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID заявки обязателен' }, { status: 400 });
    }

    await pool.query('DELETE FROM contact_requests WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления заявки:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
