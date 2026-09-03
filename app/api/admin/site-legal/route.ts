import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdminApi('content.edit');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_legal (
        id INT PRIMARY KEY DEFAULT 1,
        entity_name TEXT NOT NULL DEFAULT '',
        inn TEXT NOT NULL DEFAULT '',
        ogrn TEXT NOT NULL DEFAULT '',
        legal_address TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const r = await pool.query(
      `SELECT entity_name, inn, ogrn, legal_address FROM site_legal WHERE id = 1 LIMIT 1`
    );
    const row = r.rows[0];
    return NextResponse.json({
      entityName: row?.entity_name ?? '',
      inn: row?.inn ?? '',
      ogrn: row?.ogrn ?? '',
      legalAddress: row?.legal_address ?? '',
    });
  } catch (e) {
    console.error('admin/site-legal GET:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi('content.edit');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();
  try {
    const body = await req.json() as {
      entityName?: string;
      inn?: string;
      ogrn?: string;
      legalAddress?: string;
    };
    const entityName = (body.entityName ?? '').trim();
    const inn = (body.inn ?? '').trim();
    const ogrn = (body.ogrn ?? '').trim();
    const legalAddress = (body.legalAddress ?? '').trim();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_legal (
        id INT PRIMARY KEY DEFAULT 1,
        entity_name TEXT NOT NULL DEFAULT '',
        inn TEXT NOT NULL DEFAULT '',
        ogrn TEXT NOT NULL DEFAULT '',
        legal_address TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(
      `INSERT INTO site_legal (id, entity_name, inn, ogrn, legal_address, updated_at)
       VALUES (1, $1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         entity_name = EXCLUDED.entity_name,
         inn = EXCLUDED.inn,
         ogrn = EXCLUDED.ogrn,
         legal_address = EXCLUDED.legal_address,
         updated_at = EXCLUDED.updated_at`,
      [entityName, inn, ogrn, legalAddress]
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('admin/site-legal POST:', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
