export type Tok = { text: string; color: string };

const C = {
  plain: "#d6deeb",
  keyword: "#c792ea",
  string: "#c3e88d",
  number: "#f78c6c",
  comment: "#637777",
};

const KEYWORDS = new Set(
  `fn let mut pub use mod struct enum impl trait match if else for while loop return
   const static async await function class import export from default new this
   def lambda with as in is not and or None True False true false null undefined
   type interface extends implements package func go defer chan range var
   contract public private external internal view pure returns mapping event emit
   require self Self where ref move dyn`.split(/\s+/),
);

const RE =
  /(\/\/.*|#\s.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;

export function highlight(line: string): Tok[] {
  const out: Tok[] = [];
  const push = (text: string, color: string) => {
    const last = out[out.length - 1];
    if (last && last.color === color) last.text += text;
    else out.push({ text, color });
  };
  for (const m of line.matchAll(RE)) {
    const [t, comment, str, num, word] = m;
    if (comment) push(t, C.comment);
    else if (str) push(t, C.string);
    else if (num) push(t, C.number);
    else if (word) push(t, KEYWORDS.has(word) ? C.keyword : C.plain);
    else push(t, C.plain);
  }
  return out;
}