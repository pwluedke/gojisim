declare module "virtual:gojisim-local-decks" {
  /** The development deck files (`local-decks/*.txt`), in the dev server only; empty in builds. */
  export const files: { file: string; text: string }[];
}
