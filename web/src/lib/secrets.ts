const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
  /(api[_-]?key|secret|token|passw(or)?d|private[_-]?key)\s*[:=]\s*["'`][^"'`\s]{8,}/i,
];

export function findSecret(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}