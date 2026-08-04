/**
 * Client-side MRU of visited boards for the Home "pick up where you left
 * off" row (doc 11 §B.3). localStorage in MVP; server-side recents are V1.
 */

const KEY = "trellis.recentBoards";
const MAX = 8;

export interface RecentBoard {
  id: string;
  name: string;
  workspaceName: string;
  at: number;
}

export function listRecentBoards(): RecentBoard[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentBoard[]) : [];
  } catch {
    return [];
  }
}

export function recordRecentBoard(entry: Omit<RecentBoard, "at">): void {
  try {
    const next = [
      { ...entry, at: Date.now() },
      ...listRecentBoards().filter((b) => b.id !== entry.id),
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode) — recents just stay empty.
  }
}

export function timeAgo(ts: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
