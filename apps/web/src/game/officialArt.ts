/**
 * The official First / Second cards and card back (Tester fixes 1). They are TOHO art, so they
 * are never in git: `pnpm official-images` makes them in `public/cards/` (docs/deploy.md step
 * 3b). Without them (CI, a fresh checkout) the app keeps its drawn backs and First / Second
 * faces (decision 211).
 */

export const CARD_BACK_IMAGE = "/cards/back-thumb.webp";

/** The two official fronts of each kind, `first-1` / `first-2` and `second-1` / `second-2`. */
export const FIRST_SECOND_ART = {
  First: ["/cards/first-1-thumb.webp", "/cards/first-2-thumb.webp"],
  Second: ["/cards/second-1-thumb.webp", "/cards/second-2-thumb.webp"],
} as const;

/** FNV-1a, as the engine hashes string seeds (decision 47), on its own input. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Which First and which Second front a game shows: fixed by the game's seed, so a reloaded
 * record shows the same art. It never draws from the game's RNG, so it changes nothing in play.
 */
export function firstSecondArt(seed: number): {
  First: string;
  Second: string;
} {
  const h = hash(`first-second-art:${seed}`);
  return {
    First: FIRST_SECOND_ART.First[h & 1] as string,
    Second: FIRST_SECOND_ART.Second[(h >>> 1) & 1] as string,
  };
}

/**
 * Loads the card back image once; when it loads, `<html data-card-back="image">` switches every
 * CSS card back (piles, the bot's hand, flights, the pick's face-down cards) to it.
 */
export function detectCardBackImage(): void {
  if (typeof Image === "undefined") return;
  const image = new Image();
  image.onload = () => {
    document.documentElement.dataset["cardBack"] = "image";
  };
  image.src = CARD_BACK_IMAGE;
}
