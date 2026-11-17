// The daily duel: the same Sudoku for both of you, made from the date, with exactly one answer.

/** Small, repeatable random numbers from a seed, so both phones make the same puzzle. */
export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffle = <T,>(xs: T[], r: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const canPlace = (g: number[], i: number, v: number) => {
  const r = Math.floor(i / 9);
  const c = i % 9;
  for (let k = 0; k < 9; k++) if (g[r * 9 + k] === v || g[k * 9 + c] === v) return false;
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (g[(br + y) * 9 + bc + x] === v) return false;
  return true;
};

/** Counts answers, stopping at `limit`. */
export function countSolutions(grid: number[], limit = 2): number {
  const g = [...grid];
  let count = 0;
  const go = (): boolean => {
    // Fill the cell with the fewest options first: much faster
    let best = -1;
    let bestOpts: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const opts = [];
      for (let v = 1; v <= 9; v++) if (canPlace(g, i, v)) opts.push(v);
      if (!opts.length) return false;
      if (best < 0 || opts.length < bestOpts.length) {
        best = i;
        bestOpts = opts;
        if (opts.length === 1) break;
      }
    }
    if (best < 0) {
      count++;
      return count >= limit;
    }
    for (const v of bestOpts) {
      g[best] = v;
      if (go()) return true;
      g[best] = 0;
    }
    return false;
  };
  go();
  return count;
}

function fullGrid(r: () => number) {
  const g = Array<number>(81).fill(0);
  const fill = (i: number): boolean => {
    if (i === 81) return true;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r)) {
      if (canPlace(g, i, v)) {
        g[i] = v;
        if (fill(i + 1)) return true;
        g[i] = 0;
      }
    }
    return false;
  };
  fill(0);
  return g;
}

export type Puzzle = { puzzle: number[]; solution: number[] };

/** The puzzle for a day. About 32 numbers are given: a fair 5-to-15-minute race. */
export function puzzleFor(day: string, clues = 32): Puzzle {
  const r = rng(`chez-bebe:${day}`);
  const solution = fullGrid(r);
  const puzzle = [...solution];
  let filled = 81;
  for (const i of shuffle([...Array(81).keys()], r)) {
    if (filled <= clues) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[i] = keep;
    else filled--;
  }
  return { puzzle, solution };
}
