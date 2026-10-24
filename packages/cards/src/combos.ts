import { z } from "zod";
import esd01 from "../data/combos/ESD01.json";
import esd02 from "../data/combos/ESD02.json";

/**
 * Combos (M5g): the entries of `docs/combos/combos.md` as data. Each combo names its cards and
 * the success condition the detector (`@gojisim/engine` combos) checks. A condition is one of a
 * few shapes, each with its own parameters, so a new combo is data unless it needs a new shape.
 */

/** An ability by id, `<deck card number>#<ability id>`, e.g. `ESD01-013#rage-destroy`. */
const AbilityRefSchema = z
  .string()
  .regex(
    /^[A-Z]+\d*-\d+#[a-z0-9-]+$/,
    "an ability id like ESD01-013#rage-destroy",
  );

/** A deck card number, e.g. `ESD01-012`. */
const CardNumberSchema = z
  .string()
  .regex(/^[A-Z]+\d*-\d+$/, "a deck card number like ESD01-012");

const CountSchema = z.number().int().positive();

/** Something that happens during a turn, counted for `sameTurn`. */
export const ComboEventSchema = z.discriminatedUnion("event", [
  /** Cards destroyed by the ability (its `destroy` log entries' cards). */
  z.strictObject({
    event: z.literal("destroy"),
    by: AbilityRefSchema,
    min: CountSchema,
  }),
  /** Cards of `type` played to the board by the ability. */
  z.strictObject({
    event: z.literal("play"),
    by: AbilityRefSchema,
    type: z.enum(["Monster", "Battle", "Strategy"]),
    min: CountSchema,
  }),
  /** Rage the ability took from its master's opponent. */
  z.strictObject({
    event: z.literal("rageTaken"),
    by: AbilityRefSchema,
    min: CountSchema,
  }),
]);
export type ComboEvent = z.infer<typeof ComboEventSchema>;

export const ComboConditionSchema = z.discriminatedUnion("kind", [
  /**
   * In one turn, every event happens for the same player at least `min` times; with `total`,
   * the events' counts add up to at least that.
   */
  z.strictObject({
    kind: z.literal("sameTurn"),
    events: z.array(ComboEventSchema).min(2),
    total: CountSchema.optional(),
  }),
  /**
   * `card` tops one of its owner's `zone` stacks with at least `counterPowerBonus` counter power
   * from effects, while each card in `with` tops one of the owner's zones. Once per card.
   */
  z.strictObject({
    kind: z.literal("boardState"),
    card: CardNumberSchema,
    zone: z.number().int().min(1).max(8),
    counterPowerBonus: CountSchema,
    with: z.array(CardNumberSchema),
  }),
  /**
   * `card`, added to the hand by `foundBy` (a search that reveals it), is later played with
   * Burst, and its `enter` ability destroys at least `destroys` cards in that turn.
   */
  z.strictObject({
    kind: z.literal("foundThenBurst"),
    foundBy: AbilityRefSchema,
    card: CardNumberSchema,
    enter: AbilityRefSchema,
    destroys: CountSchema,
  }),
  /** `ability`'s cost is paid with a card of rank `op value`, and it destroys `destroys`+. */
  z.strictObject({
    kind: z.literal("paidCost"),
    ability: AbilityRefSchema,
    paidRank: z.strictObject({
      op: z.enum(["=", ">="]),
      value: z.number().int(),
    }),
    destroys: CountSchema,
  }),
  /**
   * `playedBy` plays every card in `cards` from the discard pile in one resolution, and at
   * least `evolves` of them evolve by the end of the master's next main phase.
   */
  z.strictObject({
    kind: z.literal("playedThenEvolved"),
    playedBy: AbilityRefSchema,
    cards: z.array(CardNumberSchema).min(1),
    evolves: CountSchema,
  }),
  /** `evolvedBy` evolves a `from` card, then `then` (the evolved card's ability) draws. */
  z.strictObject({
    kind: z.literal("evolvedThenDraw"),
    evolvedBy: AbilityRefSchema,
    from: CardNumberSchema,
    then: AbilityRefSchema,
  }),
]);
export type ComboCondition = z.infer<typeof ComboConditionSchema>;

export const ComboSchema = z.strictObject({
  /** Stable id, kebab-case. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** The name in `docs/combos/combos.md`. */
  name: z.string().min(1),
  /** The starter deck (set) it belongs to. */
  deck: z.string().regex(/^[A-Z]+\d*$/),
  cards: z.array(CardNumberSchema).min(2),
  success: ComboConditionSchema,
});
export type Combo = z.infer<typeof ComboSchema>;

const ComboFileSchema = z.array(ComboSchema);

/** The combo files, by deck. Each new set file is added here (M12). */
export const COMBO_FILES: Record<string, unknown> = {
  ESD01: esd01,
  ESD02: esd02,
};

let loadedCombos: Combo[] | null = null;

/** Every combo, validated once on first use. Throws on invalid data. */
export function getCombos(): Combo[] {
  if (loadedCombos) return loadedCombos;
  const combos: Combo[] = [];
  for (const [deck, raw] of Object.entries(COMBO_FILES)) {
    const result = ComboFileSchema.safeParse(raw);
    if (!result.success)
      throw new Error(
        `combos/${deck}.json is invalid: ${result.error.message}`,
      );
    for (const combo of result.data) {
      if (combo.deck !== deck)
        throw new Error(
          `combos/${deck}.json: ${combo.id} says deck ${combo.deck}`,
        );
      combos.push(combo);
    }
  }
  const ids = combos.map((c) => c.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`Two combos share the id ${dup}`);
  loadedCombos = combos;
  return combos;
}
