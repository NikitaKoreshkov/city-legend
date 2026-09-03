'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Document {
  id: number;
  title: string;
  file_url: string;
  file_size?: string;
  file_type: string;
  document_date: string;
  created_at: string;
}

export default function EditDocuments() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [message, setMessage] = useState('');

  // Форма добавления
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDocument, setNewDocument] = useState({
    title: '',
    file: null as File | null,
    document_date: new Date().toISOString().split('T')[0],
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/admin/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      } else if (response.status === 401) {
        router.push('/admin/login');
      }
    } catch (error) {
      console.error('Ошибка загрузки документов:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File): Promise<{ url: string; size: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Ошибка загрузки файла');
    }

    const data = await response.json();
    
    // Рассчитываем размер файла в МБ
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    
    return { url: data.url, size: `${sizeInMB} MB` };
  };

  const handleAddDocument = async () => {
    if (!newDocument.title || !newDocument.file || !newDocument.document_date) {
      setMessage('Заполните все поля');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      // Загружаем файл
      const { url, size } = await handleFileUpload(newDocument.file);

      // Добавляем в БД
      const response = await fetch('/api/admin/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newDocument.title,
          file_url: url,
          file_size: size,
          file_type: 'PDF',
          document_date: newDocument.document_date,
        }),
      });

      if (response.ok) {
        setMessage('Документ добавлен успешно!');
        setNewDocument({ title: '', file: null, document_date: new Date().toISOString().split('T')[0] });
        setShowAddForm(false);
        loadDocuments();
      } else {
        setMessage('Ошибка при добавлении документа');
      }
    } catch (error) {
      setMessage('Ошибка при загрузке файла');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (id: number) => {
    if (!confirm('Удалить этот документ?')) return;

    try {
      console.log('Удаление документа с ID:', id);
      const response = await fetch(`/api/admin/documents?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      console.log('Ответ сервера:', data);

      if (response.ok) {
        setMessage('Документ удален');
        // Небольшая задержка перед перезагрузкой
        setTimeout(() => {
          loadDocuments();
        }, 100);
      } else {
        setMessage(data.error || 'Ошибка при удалении');
        console.error('Ошибка удаления:', data);
      }
    } catch (error) {
      console.error('Ошибка при удалении:', error);
      setMessage('Ошибка при удалении');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p style={{ fontFamily: 'var(--font-open-sans)' }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Шапка */}
      <header className="border-b border-gray-200 py-4 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-sm hover:underline"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              ← Назад
            </Link>
            <h1
              className="text-xl"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Управление документами
            </h1>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-6 py-2 bg-black text-white hover:bg-gray-800"
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              letterSpacing: '0.05em',
            }}
          >
            {showAddForm ? 'Отмена' : '+ Добавить документ'}
          </button>
        </div>
      </header>

      {message && (
        <div className={`py-3 px-6 text-center ${message.includes('Ошибка') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      {/* Контент */}
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          
          {/* Форма добавления */}
          {showAddForm && (
            <div className="border border-gray-200 p-6 mb-8">
              <h2
                className="text-xl mb-6"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                Добавить новый документ
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Название документа
                  </label>
                  <input
                    type="text"
                    value={newDocument.title}
                    onChange={(e) => setNewDocument({ ...newDocument, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300"
                    placeholder="Например: Протокол №570"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    PDF файл
                  </label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setNewDocument({ ...newDocument, file: e.target.files[0] });
                      }
                    }}
                    className="w-full"
                  />
                  {newDocument.file && (
                    <p className="text-xs text-gray-500 mt-1">
                      Выбран: {newDocument.file.name} ({(newDocument.file.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Дата документа
                  </label>
                  <input
                    type="date"
                    value={newDocument.document_date}
                    onChange={(e) => setNewDocument({ ...newDocument, document_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                </div>

                <button
                  onClick={handleAddDocument}
                  disabled={uploading}
                  className="w-full py-3 bg-black text-white hover:bg-gray-800 disabled:bg-gray-400"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    letterSpacing: '0.05em',
                  }}
                >
                  {uploading ? 'Загрузка...' : 'Добавить документ'}
                </button>
              </div>
            </div>
          )}

          {/* Список документов */}
          <div className="space-y-4">
            <h2
              className="text-xl mb-4"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Документы ({documents.length})
            </h2>

            {documents.length === 0 ? (
              <p className="text-center text-gray-500 py-12">Нет документов</p>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="border border-gray-200 p-5 flex justify-between items-start hover:border-gray-400 transition-colors"
                >
                  <div className="flex-1">
                    <h3
                      className="text-lg mb-2"
                      style={{ fontFamily: 'var(--font-playfair-display)' }}
                    >
                      {doc.title}
                    </h3>
                    <div className="flex gap-4 text-sm text-gray-600">
                      <span>Дата: {new Date(doc.document_date).toLocaleDateString('ru-RU')}</span>
                      {doc.file_size && <span>Размер: {doc.file_size}</span>}
                      <span>Тип: {doc.file_type}</span>
                    </div>
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline mt-2 inline-block"
                    >
                      Открыть файл →
                    </a>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="ml-4 px-4 py-2 text-sm border border-red-500 text-red-500 hover:bg-red-50"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Удалить
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

