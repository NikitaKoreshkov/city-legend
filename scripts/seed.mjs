// Скрипт для добавления тестовых документов в БД
// Запуск: node scripts/seed.mjs

import pg from 'pg';
const { Pool } = pg;

// Используем .env файл или переменные окружения
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/premsite',
});

const sampleDocuments = [
  {
    title: 'Архив итоговых протоколов от 23.12.2025',
    file_url: '/documents/archive-23-12-2025.pdf',
    file_size: '530.87 КБ',
    file_type: 'RAR',
    document_date: '2025-12-23'
  },
  {
    title: 'Архив итоговых протоколов от 22.12.2025',
    file_url: '/documents/archive-22-12-2025.pdf',
    file_size: '268.95 КБ',
    file_type: 'RAR',
    document_date: '2025-12-22'
  },
  {
    title: 'Архив итоговых протоколов несостоявшихся торгов от 19.12.2025',
    file_url: '/documents/archive-failed-19-12-2025.pdf',
    file_size: '999.96 КБ',
    file_type: 'RAR',
    document_date: '2025-12-19'
  },
  {
    title: 'Архив итоговых протоколов несостоявшихся торгов от 18.12.2025',
    file_url: '/documents/archive-failed-18-12-2025.pdf',
    file_size: '624.79 КБ',
    file_type: 'RAR',
    document_date: '2025-12-18'
  },
  {
    title: 'Архив итоговых протоколов от 18.12.2025',
    file_url: '/documents/archive-18-12-2025.pdf',
    file_size: '921.79 КБ',
    file_type: 'RAR',
    document_date: '2025-12-18'
  },
  {
    title: 'Архив итоговых протоколов несостоявшихся торгов от 16.12.2025',
    file_url: '/documents/archive-failed-16-12-2025.pdf',
    file_size: '622.03 КБ',
    file_type: 'RAR',
    document_date: '2025-12-16'
  },
  {
    title: 'Архив итоговых протоколов ХМАО от 12.12.2025',
    file_url: '/documents/archive-xmao-12-12-2025.pdf',
    file_size: '1.3 МБ',
    file_type: 'RAR',
    document_date: '2025-12-12'
  },
  {
    title: 'Протокол итоговый 570 (Апраксин двор)',
    file_url: '/documents/protocol-570.pdf',
    file_size: '264.71 КБ',
    file_type: 'PDF',
    document_date: '2025-12-10'
  },
  {
    title: 'Протокол признания покупателя уклонившимся',
    file_url: '/documents/protocol-buyer-declined.pdf',
    file_size: '233.82 КБ',
    file_type: 'PDF',
    document_date: '2025-12-05'
  }
];

async function seedDocuments() {
  const client = await pool.connect();
  
  try {
    console.log('Начало добавления тестовых документов...\n');
    
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
    
    for (const doc of sampleDocuments) {
      await client.query(
        `INSERT INTO documents (title, file_url, file_size, file_type, document_date) 
         VALUES ($1, $2, $3, $4, $5)`,
        [doc.title, doc.file_url, doc.file_size, doc.file_type, doc.document_date]
      );
      console.log(`✓ Добавлен документ: ${doc.title}`);
    }
    
    console.log(`\n✅ Успешно добавлено ${sampleDocuments.length} документов!`);
  } catch (error) {
    console.error('❌ Ошибка при добавлении документов:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDocuments();

