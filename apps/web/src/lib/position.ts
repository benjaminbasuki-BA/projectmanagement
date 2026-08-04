/**
 * Fractional position ranks (docs/02-data-model.md §0: LexoRank-style
 * `position text` — reordering writes ONE row, never a bulk reindex).
 *
 * The backend currently seeds positions as `String(Date.now())` (digit
 * strings); this util only needs to produce a string that sorts
 * lexicographically between two neighbors, so it works over those seeds
 * and over its own output alike.
 */

// Characters in ascending ASCII order — string comparison must match.
const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Returns a rank strictly between `a` and `b` (either side may be
 * undefined for an open end). Assumes `a < b` when both are given.
 */
export function positionBetween(
  a: string | undefined,
  b: string | undefined,
): string {
  let prefix = "";
  let i = 0;
  let loActive = a !== undefined && a.length > 0;
  let hiActive = b !== undefined && b.length > 0;

  for (;;) {
    const lo = loActive && i < a!.length ? ALPHA.indexOf(a![i]!) : -1;
    const hi = hiActive && i < b!.length ? ALPHA.indexOf(b![i]!) : ALPHA.length;

    if (hi - lo > 1) {
      let mid = Math.round((lo + hi) / 2);
      mid = Math.min(Math.max(mid, lo + 1), hi - 1);
      if (mid === 0) {
        // Never end on the minimum char (it would leave no room for a
        // later head-insert) — commit it and pick a real digit deeper.
        prefix += ALPHA[0];
        loActive = false; // strictly above any exhausted/absent `a`
        if (hi > 0)
          hiActive = hiActive && i < b!.length && ALPHA.indexOf(b![i]!) === 0;
        i++;
        continue;
      }
      return prefix + ALPHA[mid];
    }

    // No room at this digit — copy the lower digit and go deeper.
    const d = Math.max(lo, 0);
    prefix += ALPHA[d];
    if (d > lo) loActive = false; // now strictly above `a`
    if (d < hi) hiActive = false; // now strictly below `b`
    i++;
  }
}

export function positionAfter(last: string | undefined): string {
  return positionBetween(last, undefined);
}

export function positionBefore(first: string | undefined): string {
  return positionBetween(undefined, first);
}
