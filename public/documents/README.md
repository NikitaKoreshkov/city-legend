# 📁 Размещение документов

## Как это работает

1. **Разместите файлы** в эту папку (`/public/documents/`)
2. **Добавьте запись в БД** через API или напрямую в PostgreSQL
3. **Файлы станут доступны** для скачивания на странице `/documents`

## Примеры размещения

### Вариант 1: Вручную через файловую систему

```bash
# Скопируйте ваши PDF файлы в эту папку
cp ~/Downloads/my-document.pdf public/documents/

# Файл будет доступен по адресу: /documents/my-document.pdf
```

### Вариант 2: Через API

```javascript
// Сначала загрузите файл в /public/documents/
// Затем добавьте запись в БД:

await fetch('/api/documents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Название документа',
    file_url: '/documents/my-document.pdf',
    file_size: '1.2 МБ',
    file_type: 'PDF',
    document_date: '2025-12-29'
  })
});
```

## Тестовые файлы

Сейчас в базе данных есть 9 тестовых записей:
- Архив итоговых протоколов от 23.12.2025
- Архив итоговых протоколов от 22.12.2025
- И другие...

**Важно:** Это только записи в БД. Реальные файлы еще не созданы.

При нажатии на документ браузер попытается скачать файл по указанному пути. Если файл не существует, вы увидите ошибку 404.

## Создание тестовых PDF файлов

Если нужны реальные файлы для тестирования:

```bash
# Создайте тестовый PDF (на Mac)
echo "Тестовый документ" | textutil -stdin -output public/documents/test.pdf -format txt -convert pdf

# Или создайте пустой файл
touch public/documents/archive-23-12-2025.pdf
```

## Для продакшена

В продакшене рекомендуется:
1. **Хранить файлы на CDN** (AWS S3, Cloudflare R2, etc.)
2. **Обновить `file_url`** в БД на полные URL CDN
3. **Добавить загрузку файлов** через админ-панель

Пример с CDN:
```javascript
{
  title: 'Документ',
  file_url: 'https://cdn.example.com/documents/archive-23-12-2025.pdf',
  file_size: '530.87 КБ',
  file_type: 'PDF',
  document_date: '2025-12-23'
}
```

## Текущая структура

```
public/
  └── documents/
      ├── README.md (этот файл)
      ├── .gitkeep
      └── [ваши PDF файлы здесь]
```

## Поддерживаемые форматы

- PDF
- RAR
- ZIP
- DOC/DOCX
- XLS/XLSX

Любые файлы будут доступны для скачивания.

