/**
 * Keyword abilities in card text get a bordered tag, as on the printed cards: [burst-N],
 * [evolution(-N)], [awakening-N], [base], [revenge], [resonance], [bully], [buddy]. Timing words
 * ([enter], [invading], [your-turn] ...) and traits stay plain text.
 */
const KEYWORD_TAG =
  /\[(?:burst|evolution|awakening|base|revenge|resonance|bully|buddy)(?:-\d+)?\]/g;

export interface TextPart {
  text: string;
  /** A keyword ability, drawn as a bordered tag. */
  tag: boolean;
}

/** A tag's label, as the printed cards show it: "[burst-1]" -> "Burst-1". */
export const tagLabel = (tag: string) =>
  tag.charAt(1).toUpperCase() + tag.slice(2, -1);

/** Card text cut into plain runs and keyword tags, in order. */
export function keywordParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const match of text.matchAll(KEYWORD_TAG)) {
    if (match.index > at)
      parts.push({ text: text.slice(at, match.index), tag: false });
    parts.push({ text: match[0], tag: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), tag: false });
  return parts;
}
