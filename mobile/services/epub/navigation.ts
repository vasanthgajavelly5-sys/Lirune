/**
 * Lirune Reader Mobile — EPUB Navigation & Logical Chapter Model
 *
 * Distinguishes EPUB spine items from logical story chapters and front/back matter.
 * Prevents front matter (Cover, Title Page, Synopsis, Copyright, Introduction, etc.)
 * from falsely pushing "Chapter 1" to "Chapter 6 of 1923".
 */

export type ReadingUnitType =
  | 'cover'
  | 'titlepage'
  | 'frontmatter'
  | 'toc'
  | 'chapter'
  | 'backmatter'
  | 'unknown';

export interface EpubNavigationTarget {
  spineIndex: number;
  scrollY?: number;
  anchor?: string;
}

export interface LogicalChapterInfo {
  type: ReadingUnitType;
  /** Explicit or detected story chapter number (1, 2, ...), or null if front/back matter or non-story section */
  chapterNumber: number | null;
  /** Total count of identified story chapters in the publication, or null if uninferrable */
  totalChapters: number | null;
  /** Honest user-facing display title for the section (e.g. "Synopsis", "Cover", "Chapter 1: The Beginning") */
  displayTitle: string;
  /** Short label for header/footer (e.g. "Chapter 1 of 120" or "Front Matter" or "Synopsis") */
  headerSubtitle: string;
}

export function createSpineTarget(spineIndex: number, fragment?: string): string {
  const anchor = fragment?.replace(/^#/, '');
  return `spine:${spineIndex}${anchor ? `:anchor:${encodeURIComponent(anchor)}` : ''}`;
}

export function parseSpineTarget(target: string): EpubNavigationTarget | null {
  const match = target.match(/^spine:(\d+)(?::(scroll|anchor):(.+))?$/);
  if (!match) return null;

  const parsedValue = match[3];
  if (match[2] === 'scroll') {
    const scrollY = Number.parseInt(parsedValue, 10);
    return { spineIndex: Number(match[1]), ...(Number.isFinite(scrollY) ? { scrollY: Math.max(0, scrollY) } : {}) };
  }
  if (match[2] === 'anchor') {
    try {
      return { spineIndex: Number(match[1]), anchor: decodeURIComponent(parsedValue) };
    } catch {
      return { spineIndex: Number(match[1]), anchor: parsedValue };
    }
  }
  return { spineIndex: Number(match[1]) };
}

/**
 * Common front matter keyword patterns in EPUB metadata, labels, and file paths.
 */
const FRONT_MATTER_PATTERNS = [
  /^(?:cover|jacket)\b/i,
  /^(?:title\s*page|halftitle|half-title)\b/i,
  /^(?:copyright|legal|colophon|publisher|rights)\b/i,
  /^(?:dedication|in\s*memoriam)\b/i,
  /^(?:synopsis|summary|blurb|information|about\s*the\s*book)\b/i,
  /^(?:table\s*of\s*contents|contents|toc)\b/i,
  /^(?:introduction|preface|foreword|prologue|prelude)\b/i,
  /^(?:acknowledg(?:e)?ments|author['’]?s\s*note)\b/i,
];

const BACK_MATTER_PATTERNS = [
  /^(?:epilogue|afterword|postscript)\b/i,
  /^(?:appendix|glossary|bibliography|notes|index|credits)\b/i,
  /^(?:about\s*the\s*author|also\s*by|advertisement|preview)\b/i,
];

/**
 * Checks whether a given label, path, or title represents front matter or back matter.
 */
export function classifyReadingUnitType(titleOrLabel: string, filePath?: string): ReadingUnitType {
  const normalized = (titleOrLabel || '').trim();
  const file = (filePath || '').toLowerCase();

  if (file.includes('cover') || /^(?:cover|jacket)$/i.test(normalized)) return 'cover';
  if (file.includes('title') || /^(?:title\s*page|half\s*title)$/i.test(normalized)) return 'titlepage';
  if (file.includes('toc') || /^(?:contents|table\s*of\s*contents|toc)$/i.test(normalized)) return 'toc';

  for (const pattern of FRONT_MATTER_PATTERNS) {
    if (pattern.test(normalized)) return 'frontmatter';
  }
  for (const pattern of BACK_MATTER_PATTERNS) {
    if (pattern.test(normalized)) return 'backmatter';
  }

  // Look at file name heuristics if title is empty or generic
  const baseName = file.split('/').pop() || '';
  if (/^(?:cover|title|copy|synopsis|info|intro|preface|toc)/i.test(baseName)) {
    return 'frontmatter';
  }

  return 'chapter';
}

/**
 * Attempts to extract an explicit story chapter number from a title string.
 * Examples:
 * "Chapter 1: I Have The System" -> 1
 * "Chapter 10" -> 10
 * "Ch. 5" -> 5
 * "Part 2" -> null (or 2 if standalone)
 */
export function extractExplicitChapterNumber(title: string): number | null {
  if (!title) return null;
  const match = title.match(/\b(?:chapter|ch\.|chap\.)\s*([0-9]+)\b/i);
  if (match) {
    const num = Number.parseInt(match[1], 10);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Builds the logical navigation map for an entire EPUB spine.
 *
 * For each spine item, determines its unit type, logical chapter number,
 * total story chapter count, and honest header/footer subtitle.
 */
export function buildLogicalNavigationModel(
  spine: { path: string }[],
  chapterTitles: string[]
): LogicalChapterInfo[] {
  const totalSpine = spine.length;
  const result: LogicalChapterInfo[] = [];

  let storyChapterCount = 0;
  const hasExplicitNumbers: (number | null)[] = [];

  for (let i = 0; i < totalSpine; i++) {
    const path = spine[i]?.path || '';
    const title = chapterTitles[i] || '';
    const type = classifyReadingUnitType(title, path);
    const explicitNumber = extractExplicitChapterNumber(title);
    hasExplicitNumbers.push(explicitNumber);

    if (type === 'chapter') {
      storyChapterCount++;
    }
  }

  // If at least one chapter has an explicit "Chapter N", we use explicit numbering when available.
  // Otherwise, sequential story chapters (excluding front matter) get sequential numbering 1..N.
  let currentStorySeq = 0;

  for (let i = 0; i < totalSpine; i++) {
    const path = spine[i]?.path || '';
    const title = chapterTitles[i] || '';
    const type = classifyReadingUnitType(title, path);
    const explicit = hasExplicitNumbers[i];

    let chapterNum: number | null = null;
    if (type === 'chapter') {
      currentStorySeq++;
      chapterNum = explicit !== null ? explicit : currentStorySeq;
    }

    const displayTitle = title || (type === 'chapter' ? `Section ${i + 1}` : (type.charAt(0).toUpperCase() + type.slice(1)));

    let headerSubtitle = '';
    if (type === 'chapter' && chapterNum !== null) {
      if (storyChapterCount > 0) {
        headerSubtitle = `Chapter ${chapterNum} of ${storyChapterCount}`;
      } else {
        headerSubtitle = `Chapter ${chapterNum}`;
      }
      if (title && !title.toLowerCase().startsWith('chapter')) {
        headerSubtitle += ` · ${title}`;
      }
    } else {
      headerSubtitle = displayTitle;
    }

    result.push({
      type,
      chapterNumber: chapterNum,
      totalChapters: storyChapterCount > 0 ? storyChapterCount : null,
      displayTitle,
      headerSubtitle,
    });
  }

  return result;
}
