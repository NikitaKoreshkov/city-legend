'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { AdminSelect } from '@/app/components/admin/AdminSelect';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  body: string;
  image_url: string | null;
  category: string;
  sort_order: number;
  target_segment: string;
  created_at: string;
}

const EMPTY_POST: Omit<BlogPost, 'id' | 'created_at'> = {
  title: '',
  excerpt: '',
  body: '',
  image_url: null,
  category: 'Бутик',
  sort_order: 0,
  target_segment: 'all',
};

function EditBlog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_POST });
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/blog');
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_POST });
    setShowForm(true);
  };

  const openEdit = (post: BlogPost) => {
    setEditing(post);
    setForm({
      title: post.title,
      excerpt: post.excerpt,
      body: post.body || '',
      image_url: post.image_url,
      category: post.category || 'Бутик',
      sort_order: post.sort_order ?? 0,
      target_segment: post.target_segment || 'all',
    });
    setShowForm(true);
  };

  const handleUpload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) throw new Error('Ошибка загрузки');
    const d = await res.json();
    return d.url;
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setMessage('Введите заголовок'); return; }
    const method = editing ? 'PUT' : 'POST';
    const body = editing ? { ...form, id: editing.id } : form;
    const res = await fetch('/api/admin/blog', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setMessage(editing ? 'Публикация обновлена' : 'Публикация добавлена');
      setShowForm(false);
      load();
    } else {
      const d = await res.json();
      setMessage(d.error || 'Ошибка сохранения');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить публикацию?')) return;
    const res = await fetch(`/api/admin/blog?id=${id}`, { method: 'DELETE' });
    if (res.ok) { setMessage('Удалено'); load(); }
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 py-4 sticky top-0 bg-white z-50">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm hover:underline" style={{ fontFamily: 'var(--font-open-sans)' }}>
              ← Назад
            </Link>
            <h1 className="text-xl" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              Блог бутика
            </h1>
          </div>
          <button
            onClick={openCreate}
            className="px-6 py-2 bg-black text-white hover:bg-gray-800 text-sm"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.05em' }}
          >
            + Добавить публикацию
          </button>
        </div>
      </header>

      {message && (
        <div className={`py-3 px-6 text-center text-sm ${message.includes('Ошибка') || message.includes('Введите') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {loading ? (
          <p className="text-center text-gray-500">Загрузка...</p>
        ) : posts.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Нет публикаций</p>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <div key={post.id} className="border border-gray-200 p-5 flex gap-4">
                {post.image_url && (
                  <img src={post.image_url} alt="" className="w-24 h-24 object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-gray-400 mr-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        {post.category}
                      </span>
                      <h3 className="text-lg font-normal mt-1" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                        {post.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        {post.excerpt}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4 flex-shrink-0">
                      <button
                        onClick={() => openEdit(post)}
                        className="px-3 py-1 text-sm border border-black hover:bg-black hover:text-white transition-colors"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="px-3 py-1 text-sm border border-red-500 text-red-500 hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-playfair-display)' }}>
              {editing ? 'Редактировать публикацию' : 'Новая публикация'}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Категория</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border text-sm"
                    placeholder="Бутик, Коллекция, Гарантии…"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Порядок сортировки</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Целевой сегмент</label>
                  <AdminSelect
                    value={form.target_segment}
                    onChange={v => setForm({ ...form, target_segment: v })}
                    options={[
                      { value: 'all', label: 'Все клиенты' },
                      { value: 'new', label: 'Новые (без заказов)' },
                      { value: 'active', label: 'Активные (1+ заказ)' },
                      { value: 'vip', label: 'VIP (5+ заказов или 50 000 ₽+)' },
                    ]}
                    fullWidth
                  />
                  <p className="text-xs text-gray-400 mt-1">Кому показывать статью в кабинете</p>
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1">Заголовок *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Краткое описание (отображается в списке)</label>
                <textarea
                  value={form.excerpt}
                  onChange={e => setForm({ ...form, excerpt: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border text-sm"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Полный текст статьи</label>
                <textarea
                  value={form.body}
                  onChange={e => setForm({ ...form, body: e.target.value })}
                  rows={10}
                  className="w-full px-3 py-2 border text-sm font-mono"
                  placeholder="Текст статьи. Можно использовать переносы строк для параграфов."
                />
              </div>

              <div>
                <label className="block text-sm mb-1">Изображение</label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const url = await handleUpload(file);
                      setForm({ ...form, image_url: url });
                    } catch {
                      setMessage('Ошибка загрузки изображения');
                    }
                    setUploading(false);
                  }}
                  className="mb-2"
                />
                {uploading && <p className="text-sm text-gray-500">Загрузка...</p>}
                {form.image_url && (
                  <div className="relative w-40">
                    <img src={form.image_url} alt="" className="w-40 h-28 object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image_url: null })}
                      className="absolute top-1 right-1 bg-red-500 text-white text-xs px-1.5 py-0.5"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Или введите URL вручную</label>
                  <input
                    type="text"
                    value={form.image_url || ''}
                    onChange={e => setForm({ ...form, image_url: e.target.value || null })}
                    className="w-full px-3 py-1.5 border text-sm"
                    placeholder="/uploads/photo.jpg или https://..."
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-black text-white hover:bg-gray-800"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-8 py-3 border border-gray-300 hover:bg-gray-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditBlogPage() {
  return (
    <AdminProtected permission="marketing.edit">
      <EditBlog />
    </AdminProtected>
  );
}
