// 地图来源抽象：Web 版从 HTTP 读；以后加桌面目录或 APK 原生扫描时实现同一个接口。
import type { Book, Chapter } from './engine';

export interface BookSummary {
  id: string;
  title: string;
  author?: string;
  /** maps/ 下的目录名 */
  dir: string;
  /** 相对 maps/ 的书文件路径，如 pharmacology/book.json */
  file: string;
  chapters: number;
  fragments: number;
  /** 每章的碎片数，供列表页显示；章节内容按需加载 */
  chapterMeta?: { id: string; title?: string; order: number; fragments: number }[];
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

/** 运行时资源路径：GitHub Pages 在 /<repo>/ 子路径下，所有 fetch 都经这里拼 BASE_URL */
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

export class HttpMapSource implements MapSource {
  private indexCache: BookIndex | null = null;
  private bookCache = new Map<string, Book>();
  private chapterCache = new Map<string, Chapter>();

  async listBooks(): Promise<BookSummary[]> {
    return (await this.index()).books;
  }

  private async index(): Promise<BookIndex> {
    if (!this.indexCache) {
      this.indexCache = await fetchJson<BookIndex>(assetUrl('maps/index.json'));
    }
    return this.indexCache;
  }

  private async entry(bookId: string): Promise<BookSummary> {
    const found = (await this.index()).books.find((b) => b.id === bookId);
    if (!found) throw new Error(`找不到书：${bookId}`);
    return found;
  }

  async loadBook(id: string): Promise<Book> {
    const cached = this.bookCache.get(id);
    if (cached) return cached;
    const entry = await this.entry(id);
    const book = await fetchJson<Book>(assetUrl(`maps/${entry.file}`));
    this.bookCache.set(id, book);
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
    const chapter = await fetchJson<Chapter>(assetUrl(`maps/${entry.dir}/${ref.file}`));
    this.chapterCache.set(key, chapter);
    return chapter;
  }
}

export interface BookBundle {
  summary: BookSummary;
  book: Book;
  chapters: Record<string, Chapter>;
}

export async function loadBookBundle(source: MapSource, summary: BookSummary): Promise<BookBundle> {
  const book = await source.loadBook(summary.id);
  // 章节内容按需加载：大书（脚本版 48 章）一次性拉全会卡死移动端
  return { summary, book, chapters: {} };
}
