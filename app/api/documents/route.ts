import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET - получить все документы с фильтрацией и сортировкой
export async function GET(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    // Создаем таблицу, если её нет
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        file_url TEXT NOT NULL,
        file_size VARCHAR(50),
        file_type VARCHAR(10) DEFAULT 'PDF',
        document_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Проверяем, есть ли документы, если нет - добавляем тестовые
    const countResult = await client.query('SELECT COUNT(*) FROM documents');
    const count = parseInt(countResult.rows[0].count);
    
    if (count === 0) {
      // Добавляем тестовые документы
      const sampleDocuments = [
        { title: 'Архив итоговых протоколов от 23.12.2025', file_url: '/documents/archive-23-12-2025.pdf', file_size: '530.87 КБ', file_type: 'RAR', document_date: '2025-12-23' },
        { title: 'Архив итоговых протоколов от 22.12.2025', file_url: '/documents/archive-22-12-2025.pdf', file_size: '268.95 КБ', file_type: 'RAR', document_date: '2025-12-22' },
        { title: 'Архив итоговых протоколов несостоявшихся торгов от 19.12.2025', file_url: '/documents/archive-failed-19-12-2025.pdf', file_size: '999.96 КБ', file_type: 'RAR', document_date: '2025-12-19' },
        { title: 'Архив итоговых протоколов несостоявшихся торгов от 18.12.2025', file_url: '/documents/archive-failed-18-12-2025.pdf', file_size: '624.79 КБ', file_type: 'RAR', document_date: '2025-12-18' },
        { title: 'Архив итоговых протоколов от 18.12.2025', file_url: '/documents/archive-18-12-2025.pdf', file_size: '921.79 КБ', file_type: 'RAR', document_date: '2025-12-18' },
        { title: 'Архив итоговых протоколов несостоявшихся торгов от 16.12.2025', file_url: '/documents/archive-failed-16-12-2025.pdf', file_size: '622.03 КБ', file_type: 'RAR', document_date: '2025-12-16' },
        { title: 'Архив итоговых протоколов ХМАО от 12.12.2025', file_url: '/documents/archive-xmao-12-12-2025.pdf', file_size: '1.3 МБ', file_type: 'RAR', document_date: '2025-12-12' },
        { title: 'Протокол итоговый 570 (Апраксин двор)', file_url: '/documents/protocol-570.pdf', file_size: '264.71 КБ', file_type: 'PDF', document_date: '2025-12-10' },
        { title: 'Протокол признания покупателя уклонившимся', file_url: '/documents/protocol-buyer-declined.pdf', file_size: '233.82 КБ', file_type: 'PDF', document_date: '2025-12-05' }
      ];
      
      for (const doc of sampleDocuments) {
        await client.query(
          `INSERT INTO documents (title, file_url, file_size, file_type, document_date) 
           VALUES ($1, $2, $3, $4, $5)`,
          [doc.title, doc.file_url, doc.file_size, doc.file_type, doc.document_date]
        );
      }
    }
    
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const sortOrder = searchParams.get('sort') || 'desc'; // desc = новые первые, asc = старые первые
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = `
      SELECT 
        id, 
        title, 
        file_url, 
        file_size, 
        file_type,
        document_date,
        created_at
      FROM documents
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    // Фильтр по поиску
    if (search) {
      query += ` AND LOWER(title) LIKE LOWER($${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Фильтр по диапазону дат
    if (startDate) {
      query += ` AND document_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND document_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    // Сортировка
    query += ` ORDER BY document_date ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;

    const result = await client.query(query, params);

    return NextResponse.json({
      documents: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Ошибка при получении документов:', error);
    return NextResponse.json(
      { error: 'Ошибка при получении документов' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// POST - добавить новый документ (для админ-панели в будущем)
export async function POST(request: NextRequest) {
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { title, file_url, file_size, file_type = 'PDF', document_date } = body;

    if (!title || !file_url || !document_date) {
      return NextResponse.json(
        { error: 'Отсутствуют обязательные поля: title, file_url, document_date' },
        { status: 400 }
      );
    }

    const result = await client.query(
      `INSERT INTO documents (title, file_url, file_size, file_type, document_date) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [title, file_url, file_size, file_type, document_date]
    );

    return NextResponse.json({
      message: 'Документ успешно добавлен',
      document: result.rows[0]
    }, { status: 201 });
  } catch (error) {
    console.error('Ошибка при добавлении документа:', error);
    return NextResponse.json(
      { error: 'Ошибка при добавлении документа' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

