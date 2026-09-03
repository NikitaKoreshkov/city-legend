import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

// GET - получить все документы
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM documents ORDER BY document_date DESC, created_at DESC'
    );

    return NextResponse.json({ documents: result.rows });
  } catch (error) {
    console.error('Ошибка получения документов:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// POST - добавить новый документ
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title, file_url, file_size, file_type, document_date } = await request.json();

    if (!title || !file_url || !document_date) {
      return NextResponse.json(
        { error: 'Название, файл и дата обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO documents (title, file_url, file_size, file_type, document_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, file_url, file_size || null, file_type || 'PDF', document_date]
    );

    return NextResponse.json({ success: true, document: result.rows[0] });
  } catch (error) {
    console.error('Ошибка добавления документа:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE - удалить документ
export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    console.log('DELETE request - ID:', id);

    if (!id) {
      return NextResponse.json({ error: 'ID документа обязателен' }, { status: 400 });
    }

    const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);
    
    console.log('Удалено строк:', result.rowCount);
    console.log('Удаленный документ:', result.rows[0]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Ошибка удаления документа:', error);
    return NextResponse.json({ 
      error: 'Ошибка сервера',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

