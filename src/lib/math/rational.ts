export type Rational = Readonly<{ numerator: number; denominator: number }>;

const INTEGER = /^([+-]?\d+)$/;
const FRACTION = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/;
const DECIMAL = /^([+-]?)(?:(\d+)\.(\d+)|(\d+)\.)$/;

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

export function reduceRational(numerator: number, denominator: number): Rational | null {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) return null;
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return { numerator: sign * numerator / divisor, denominator: sign * denominator / divisor };
}

/** Parses supported learner input without using floating-point arithmetic. */
export function parseRational(value: string): Rational | null {
  const input = value.trim();
  if (!input) return null;

  const fraction = input.match(FRACTION);
  if (fraction) return reduceRational(Number(fraction[1]), Number(fraction[2]));

  const integer = input.match(INTEGER);
  if (integer) return reduceRational(Number(integer[1]), 1);

  const decimal = input.match(DECIMAL);
  if (!decimal) return null;
  const sign = decimal[1] === "-" ? -1 : 1;
  const whole = decimal[2] ?? decimal[4] ?? "0";
  const fractional = decimal[3] ?? "";
  const denominator = 10 ** fractional.length;
  const numerator = sign * (Number(whole) * denominator + Number(fractional || "0"));
  return reduceRational(numerator, denominator);
}

export function rationalToString(value: Rational): string {
  return value.denominator === 1 ? String(value.numerator) : `${value.numerator}/${value.denominator}`;
}

export function normalizeRational(value: string): string | null {
  const parsed = parseRational(value);
  return parsed ? rationalToString(parsed) : null;
}

export function areEquivalentRationals(left: string, right: string): boolean {
  const a = parseRational(left);
  const b = parseRational(right);
  return Boolean(a && b && a.numerator === b.numerator && a.denominator === b.denominator);
}
