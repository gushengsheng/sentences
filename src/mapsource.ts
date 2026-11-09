// 地图来源抽象：v2 只实现 HTTP（Web / GitHub Pages）。
// 以后加桌面目录（DirMapSource）或 APK 原生扫描（CapacitorMapSource）时，
// 只要实现同一个 MapSource，业务代码不用改。
import {
  bookFromPack,
  chapterFromPack,
  normalizeBook,
  type Book,
  type Chapter,
  type MapPack,
} from './engine';

export interface BookSummary {
  id: string;
  title: string;
  author?: string;
  /** maps/ 下的目录名 */
  dir: string;
  /** 相对 maps/ 的书文件路径，例如 pharmacology/book.json */
  file: string;
  chapters: number;
  fragments: number;
}

export interface MapSource {
  listBooks(): Promise<BookSummary[]>;
  loadBook(id: string): Promise<Book>;
  loadChapter(bookId: string, chapterId: string): Promise<Chapter>;
}

interface BookIndex {
  schemaVersion: number;
  books: BookSummary[];
}

/**
 * 运行时资源路径。
 * GitHub Pages 部署在 /<repo>/ 子路径下，写死 /maps/... 会 404 白屏，
 * 所以所有 fetch 都要经过这里拼 import.meta.env.BASE_URL。
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path.replace(/^\/+/, '')}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

/** Web 实现：从 public/maps 读 index.json → book.json → 章节文件 */
export class HttpMapSource implements MapSource {
  private indexCache: BookIndex | null = null;
  private bookCache = new Map<string, Book>();
  private chapterCache = new Map<string, Chapter>();
  /** v1 单章书的原始包，loadChapter 时复用 */
  private legacyPackCache = new Map<string, MapPack>();

  async listBooks(): Promise<BookSummary[]> {
    const index = await this.index();
    return index.books;
  }

  private async index(): Promise<BookIndex> {
    if (!this.indexCache) {
      this.indexCache = await fetchJson<BookIndex>(assetUrl('maps/index.json'));
    }
    return this.indexCache;
  }

  private async entry(bookId: string): Promise<BookSummary> {
    const index = await this.index();
    const found = index.books.find((b) => b.id === bookId);
    if (!found) throw new Error(`找不到书：${bookId}`);
    return found;
  }

  async loadBook(id: string): Promise<Book> {
    const cached = this.bookCache.get(id);
    if (cached) return cached;

    const entry = await this.entry(id);
    const raw = await fetchJson<Book | MapPack>(assetUrl(`maps/${entry.file}`));
    const book = 'maps' in raw ? bookFromPack(raw, entry.title) : normalizeBook(raw);
    // 目录名以 index 为准：书内第 1 章可能和书文件同文件（v1 兼容）
    this.bookCache.set(id, book);
    if ('maps' in raw) this.legacyPackCache.set(id, raw);
    return book;
  }

  async loadChapter(bookId: string, chapterId: string): Promise<Chapter> {
    const key = `${bookId}::${chapterId}`;
    const cached = this.chapterCache.get(key);
    if (cached) return cached;

    const entry = await this.entry(bookId);
    const book = await this.loadBook(bookId);
    const ref = book.chapters.find((c) => c.id === chapterId);
    if (!ref) throw new Error(`找不到章节：${bookId}/${chapterId}`);

    let chapter: Chapter;
    if (!ref.file) {
      // v1 单章书：书文件本身就是一个地图包
      const pack = this.legacyPackCache.get(bookId);
      if (!pack) throw new Error(`章节文件缺失：${bookId}/${chapterId}`);
      chapter = chapterFromPack(pack);
    } else {
      const raw = await fetchJson<Chapter | MapPack>(
        assetUrl(`maps/${entry.dir}/${ref.file}`),
      );
      chapter = 'maps' in raw ? chapterFromPack(raw) : raw;
    }
    this.chapterCache.set(key, chapter);
    return chapter;
  }
}

/** 全书缓存：一次把书和它所有章节读进来（章节文件都很小） */
export interface BookBundle {
  summary: BookSummary;
  book: Book;
  chapters: Record<string, Chapter>;
}

export async function loadBookBundle(
  source: MapSource,
  summary: BookSummary,
): Promise<BookBundle> {
  const book = await source.loadBook(summary.id);
  const chapters: Record<string, Chapter> = {};
  await Promise.all(
    book.chapters.map(async (ref) => {
      chapters[ref.id] = await source.loadChapter(summary.id, ref.id);
    }),
  );
  return { summary, book, chapters };
}
