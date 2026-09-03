import { NextResponse } from 'next/server';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

const VIDEO_EXT = new Set([
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.3gp', '.ogv',
]);
const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.heic', '.heif', '.jfif',
]);

/** Папка `public` на диске (в standalone cwd часто `.next/standalone` — пишем в корневой public). */
function getUploadsPublicRoot(): string {
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const cwd = process.cwd();
  if (path.basename(cwd) === 'standalone' && cwd.includes(`${path.sep}.next${path.sep}standalone`)) {
    return path.resolve(cwd, '..', '..', 'public');
  }
  return path.join(cwd, 'public');
}

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 400 });
    }

    const timestamp = Date.now();
    const originalName = file.name.replace(/\s/g, '-');
    const fileName = `${timestamp}-${originalName}`;
    const ext = path.extname(originalName).toLowerCase();

    let directory = 'uploads';
    if (file.type.startsWith('image/') || IMAGE_EXT.has(ext)) {
      directory = 'uploads/images';
    } else if (file.type === 'application/pdf') {
      directory = 'uploads/documents';
    } else if (file.type.startsWith('video/') || VIDEO_EXT.has(ext)) {
      directory = 'uploads/videos';
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      directory = 'uploads/videos';
    }

    const uploadsBase = getUploadsPublicRoot();
    const publicPath = path.join(uploadsBase, directory);

    await mkdir(publicPath, { recursive: true });

    const filePath = path.join(publicPath, fileName);
    const webStream = file.stream();
    await pipeline(Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(filePath));

    const publicUrl = `/${directory}/${fileName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName,
    });
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    return NextResponse.json({ error: 'Ошибка загрузки файла' }, { status: 500 });
  }
}
