export interface EpubNavigationTarget {
  spineIndex: number;
  scrollY?: number;
  anchor?: string;
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
