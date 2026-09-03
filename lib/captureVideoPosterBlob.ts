/**
 * Извлекает один кадр из mp4 как лёгкий blob-постер (кэшируется по videoSrc на таб).
 * Цель: не хранить в CMS отдельный JPG, минимум трафика повторным использованием кэша.
 */

/** Максимальная большая сторона постера после даунскейла (видеоролик может быть 4K). */
const POSTER_MAX_EDGE_PX = 1280;

type HeroPosterCapture = { blob: Blob; width: number; height: number };

const posterCaptureCache = new Map<string, Promise<HeroPosterCapture>>();

function loadMeta(v: HTMLVideoElement, preload: '' | 'metadata' | 'auto'): Promise<void> {
  return new Promise((resolve, reject) => {
    v.preload = preload;
    const ok = () => {
      cleanup();
      resolve();
    };
    const err = () => {
      cleanup();
      reject(new Error('video-metadata'));
    };
    const cleanup = () => {
      v.removeEventListener('loadedmetadata', ok);
      v.removeEventListener('error', err);
    };
    v.addEventListener('loadedmetadata', ok, { once: true });
    v.addEventListener('error', err, { once: true });
    v.load();
  });
}

function waitSeek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onErr);
      reject(new Error('video-seek'));
    };
    v.addEventListener('seeked', onSeeked, { once: true });
    v.addEventListener('error', onErr, { once: true });
    try {
      v.currentTime = t;
    } catch {
      reject(new Error('video-seek-set'));
    }
  });
}

async function frameToSizedCanvas(video: HTMLVideoElement): Promise<HeroPosterCapture> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('video-zero-dims');

  const scale = Math.min(1, POSTER_MAX_EDGE_PX / Math.max(vw, vh));
  const tw = Math.max(1, Math.round(vw * scale));
  const th = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas-2d');

  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(video, {
        resizeWidth: tw,
        resizeHeight: th,
        resizeQuality: 'high',
      });
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
    }
  } catch {
    ctx.drawImage(video, 0, 0, tw, th);
  }

  const width = canvas.width;
  const height = canvas.height;

  const webpBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.8);
  });
  if (webpBlob) return { blob: webpBlob, width, height };

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob-null'))),
      'image/jpeg',
      0.82
    );
  });
  return { blob: jpegBlob, width, height };
}

async function extractOnce(videoSrc: string): Promise<HeroPosterCapture> {
  const tryPreload = async (preload: '' | 'metadata' | 'auto') => {
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    /** Тот же домен что и страница — можно рисовать в canvas без taint при обычной выдаче. */
    v.crossOrigin = 'anonymous';
    v.src = videoSrc;
    await loadMeta(v, preload);
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null;
    const t = dur != null ? Math.min(0.08, dur * 0.02) : 0.001;
    await waitSeek(v, t);
    const cap = await frameToSizedCanvas(v);
    v.removeAttribute('src');
    v.load();
    return cap;
  };

  try {
    return await tryPreload('metadata');
  } catch {
    return await tryPreload('auto');
  }
}

/**
 * Общее извлечение для всех постер-слоёв с тем же mp4 URL (нет двойного seek/toBlob при split).
 */
export function getHeroPosterCaptureFromVideo(videoSrc: string): Promise<HeroPosterCapture> {
  let p = posterCaptureCache.get(videoSrc);
  if (!p) {
    p = extractOnce(videoSrc);
    posterCaptureCache.set(videoSrc, p);
    void p.catch(() => posterCaptureCache.delete(videoSrc));
  }
  return p;
}
