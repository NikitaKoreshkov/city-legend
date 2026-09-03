import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function GET(request: Request) {
  const auth = await requireAdminApi('support.tickets');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { searchParams } = new URL(request.url);
    const ticketId = Number(searchParams.get('ticketId'));
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return NextResponse.json({ error: 'ticketId обязателен' }, { status: 400 });
    }
    const res = await pool.query(
      `SELECT id, sender_type, message, created_at
       FROM cabinet_concierge_messages
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticketId]
    );
    return NextResponse.json({ messages: res.rows });
  } catch (e) {
    console.error('[admin concierge messages]', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
