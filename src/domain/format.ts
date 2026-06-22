/** Snap a value to the nearest 1/denom" (the cut-list grid; default 1/16"). */
export function snapTo(value: number, denom = 16): number {
  return Math.round(value * denom) / denom;
}

/** Short tag from an internal id like "bay-3f2a1b9c" → "3f2a1b9c" for part IDs/labels. */
export function shortId(id: string): string {
  return id.split('-').pop() || id;
}

/** Format a decimal-inch value as a fraction string, e.g. 23.25 → 23 1/4". */
export function toFraction(value: number, denom = 16): string {
  const neg = value < 0;
  const v = Math.abs(value);
  const whole = Math.floor(v);
  let num = Math.round((v - whole) * denom);
  let d = denom;
  if (num === denom) {
    return `${neg ? '-' : ''}${whole + 1}"`;
  }
  // reduce
  while (num % 2 === 0 && d % 2 === 0 && num !== 0) {
    num /= 2;
    d /= 2;
  }
  const sign = neg ? '-' : '';
  if (num === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${num}/${d}"`;
  return `${sign}${whole} ${num}/${d}"`;
}

/** Format a dollar amount, e.g. 12.5 → "$12.50". */
export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Format a length in inches as feet + inches, e.g. 30 → "2' 6"", 8 → "8"". */
export function feetInches(totalIn: number): string {
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return ft > 0 ? `${ft}' ${inch}"` : `${inch}"`;
}

const IN_PER_MM = 1 / 25.4;

/**
 * Parse a length expression into inches — the single parser behind every numeric
 * dimension field. Accepts, and mixes:
 *   - inches: `23`, `23.25`, `23 1/4`, `1/2`, `24"`, `24in`
 *   - feet / feet-inches: `6'`, `6.5ft`, `6'3"`, `6' 3 1/2"`
 *   - metric: `300mm`, `30cm`, `0.8m`
 *   - arithmetic over any of the above: `24+12`, `(48-1)/2`, `2*15`
 * Returns null on anything unparseable (so the field can revert).
 */
export function parseInches(input: string): number | null {
  // Collapse every measurement token to a decimal-inch number, leaving the
  // arithmetic operators (+ - * / and parens) intact, then evaluate.
  let s = input.trim().toLowerCase();
  if (s === '') return null;
  // Feet + whole-inches + fraction: 6' 3 1/2"
  s = s.replace(/(\d+(?:\.\d+)?)\s*'\s*(\d+)\s+(\d+)\/(\d+)\s*"?/g,
    (_m, ft, inch, n, d) => String(+ft * 12 + +inch + (+d ? +n / +d : Infinity)));
  // Feet + inches (whole or decimal): 6'3", 6' 3, 5'6"
  s = s.replace(/(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)\s*"?/g, (_m, ft, inch) => String(+ft * 12 + +inch));
  // Feet only: 6', 6.5', 6ft, 6.5 ft
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:ft|')/g, (_m, ft) => String(+ft * 12));
  // Metric (mm/cm before m so they aren't eaten by the bare-metre rule).
  s = s.replace(/(\d+(?:\.\d+)?)\s*mm\b/g, (_m, v) => String(+v * IN_PER_MM));
  s = s.replace(/(\d+(?:\.\d+)?)\s*cm\b/g, (_m, v) => String(+v * IN_PER_MM * 10));
  s = s.replace(/(\d+(?:\.\d+)?)\s*m\b/g, (_m, v) => String(+v * IN_PER_MM * 1000));
  // Strip an explicit inch unit/mark so the bare number remains.
  s = s.replace(/(\d(?:[\d.]*\d)?)\s*(?:inches|inch|in|")/g, (_m, v) => v);
  // Mixed fraction: 23 1/4 → 23.25 (must run before '/' is read as division).
  s = s.replace(/(\d+)\s+(\d+)\/(\d+)/g, (_m, w, n, d) => String(+d ? +w + +n / +d : Infinity));

  const v = evalArith(s);
  return v != null && Number.isFinite(v) ? v : null;
}

/** Evaluate a + - * / ( ) expression over decimals. Returns null if malformed. */
function evalArith(s: string): number | null {
  const tokens: (number | string)[] = [];
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if ('+-*/()'.includes(c)) { tokens.push(c); i++; continue; }
    const m = /^(\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (!m) return null; // a stray letter (e.g. "abc") — unparseable
    tokens.push(parseFloat(m[1]));
    i += m[1].length;
  }
  if (tokens.length === 0) return null;

  let pos = 0;
  const factor = (): number | null => {
    let sign = 1;
    while (tokens[pos] === '+' || tokens[pos] === '-') { if (tokens[pos] === '-') sign = -sign; pos++; }
    const t = tokens[pos];
    if (t === '(') {
      pos++;
      const v = expr();
      if (v == null || tokens[pos] !== ')') return null;
      pos++;
      return sign * v;
    }
    if (typeof t === 'number') { pos++; return sign * t; }
    return null;
  };
  const term = (): number | null => {
    let left = factor();
    if (left == null) return null;
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++];
      const right = factor();
      if (right == null) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  function expr(): number | null {
    let left = term();
    if (left == null) return null;
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++];
      const right = term();
      if (right == null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = expr();
  return result != null && pos === tokens.length ? result : null;
}
