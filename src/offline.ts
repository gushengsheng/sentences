import { assetUrl } from './mapsource';
import type { Book } from './engine';

/** 与 public/sw.js 里的 CACHE 名称保持一致 */
export const OFFLINE_CACHE = 'sentences-v4';

function chapterUrls(dir: string, book: Book): string[] {
  return (book.chapters || []).map((c) => assetUrl(`maps/${dir}/${c.file}`));
}

export async function isBookCached(dir: string, book: Book): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    if (!(await cache.match(assetUrl(`maps/${dir}/book.json`)))) return false;
    for (const u of chapterUrls(dir, book)) {
      if (!(await cache.match(u))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function cacheBook(
  dir: string,
  book: Book,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const cache = await caches.open(OFFLINE_CACHE);
  const urls = chapterUrls(dir, book);
  let done = 0;
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'reload' });
      if (res.ok) await cache.put(u, res);
    } catch {
      /* 单项失败跳过 */
    }
    done++;
    onProgress?.(done, urls.length);
  }
  try {
    const u = assetUrl(`maps/${dir}/book.json`);
    const res = await fetch(u, { cache: 'reload' });
    if (res.ok) await cache.put(u, res);
  } catch {
    /* ignore */
  }
}

export async function uncacheBook(dir: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(OFFLINE_CACHE);
  const prefix = assetUrl(`maps/${dir}/`);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((k) => new URL(k.url).pathname.startsWith(prefix))
      .map((k) => cache.delete(k)),
  );
}
