/**
 * Splits a long post into a sequence of tweet-sized chunks for an X thread.
 *
 * X caps a tweet at 280 characters, so a longer draft is broken on paragraph,
 * then sentence, then word boundaries, with a ` (i/n)` counter appended to each
 * part. The counter is accounted for in the budget so no numbered part can
 * exceed the limit. A single overlong token (e.g. a URL) is hard-split only as
 * a last resort.
 */

const LIMIT = 280;

/** Greedily packs words into pieces no longer than `budget`. */
function pack(text: string, budget: number): string[] {
  const pieces: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      pieces.push(current);
      current = "";
    }
  };

  for (const rawParagraph of text.split("\n")) {
    const paragraph = rawParagraph.trim();
    if (!paragraph) {
      // Preserve a blank line between paragraphs when it fits.
      if (current && current.length + 1 <= budget) current += "\n";
      continue;
    }
    for (const word of paragraph.split(/\s+/)) {
      if (!current) {
        current = word.length <= budget ? word : "";
        if (!current) {
          // Hard-split an overlong token across pieces.
          for (let i = 0; i < word.length; i += budget) {
            pieces.push(word.slice(i, i + budget));
          }
        }
        continue;
      }
      if (current.length + 1 + word.length <= budget) {
        current += " " + word;
      } else {
        flush();
        if (word.length <= budget) {
          current = word;
        } else {
          for (let i = 0; i < word.length; i += budget) {
            pieces.push(word.slice(i, i + budget));
          }
        }
      }
    }
    flush();
  }
  flush();
  return pieces.filter(Boolean);
}

export function splitThread(text: string, limit = LIMIT): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return [trimmed];

  // First pass with a rough budget to learn how many parts we need, then a
  // second pass whose budget reserves exactly the counter width ` (i/n)`.
  const rough = pack(trimmed, limit - 6);
  const n = Math.max(rough.length, 2);
  const counterWidth = ` (${n}/${n})`.length;
  const parts = pack(trimmed, limit - counterWidth);

  const total = parts.length;
  return parts.map((p, i) => `${p} (${i + 1}/${total})`);
}
