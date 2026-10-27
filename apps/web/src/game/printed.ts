/**
 * A printed X in counter power or threat: the card data stores −1, and the engine reads it as 0,
 * so the value comes from the card's ability (decision 373; Monster X, EBP03-067,
 * EBP04-031/032/047). The UI shows it as "X", never −1.
 */
export const PRINTED_X = -1;

/** The value the engine starts from: 0 for a printed X. */
export const printedBase = (printed: number) =>
  printed === PRINTED_X ? 0 : printed;

/** The printed value as the card shows it: "X" for a printed X. */
export const printedText = (printed: number) =>
  printed === PRINTED_X ? "X" : String(printed);

/**
 * A printed value with its current value: "X = 12000" for a printed X (no modifier, since the
 * whole value comes from the ability), otherwise the printed number and the modifier to show.
 */
export function printedWithCurrent(
  printed: number,
  current: number | undefined,
): { text: string; modifier: number } {
  if (printed === PRINTED_X)
    return {
      text: current === undefined ? "X" : `X = ${current}`,
      modifier: 0,
    };
  return {
    text: String(printed),
    modifier: current === undefined ? 0 : current - printed,
  };
}
