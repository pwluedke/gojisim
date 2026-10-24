import { z } from "zod";
import ebp01 from "../data/abilities/EBP01.json";
import ebp02 from "../data/abilities/EBP02.json";
import ebp03 from "../data/abilities/EBP03.json";
import ebp04 from "../data/abilities/EBP04.json";
import esd01 from "../data/abilities/ESD01.json";
import esd02 from "../data/abilities/ESD02.json";

/**
 * Card ability data (docs/abilities/format.md, the M4 contract). Every type of the format is in
 * the schema, M12 rows included, so the data format stays stable; the engine throws
 * `not implemented: <effect>` for parts it doesn't run yet.
 */

export const ZoneSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);
export type Zone = z.infer<typeof ZoneSchema>;

export const OpSchema = z.enum(["<", "<=", "=", "!=", ">=", ">"]);
export type Op = z.infer<typeof OpSchema>;

/** A player relative to the ability's master. */
export const PlayerRefSchema = z.enum(["you", "opponent", "any"]);
export type PlayerRef = z.infer<typeof PlayerRefSchema>;

/** The player an effect acts on. */
export const EffectPlayerSchema = z.enum(["you", "opponent", "each"]);
export type EffectPlayer = z.infer<typeof EffectPlayerSchema>;

export const PhaseSchema = z.enum(["start", "main", "counter", "end"]);
export type Phase = z.infer<typeof PhaseSchema>;

export const WhoseSchema = z.enum(["yours", "opponents"]);

/** Last known information of a card bound with `as` (10.10). */
export const ValueRefSchema = z.strictObject({
  ref: z.string().min(1),
  field: z.enum(["rank", "counterPower", "threat"]),
});
export type ValueRef = z.infer<typeof ValueRefSchema>;

const ZoneAnchorSchema = z.union([
  z.enum(["this", "yourMonster", "opponentMonster"]),
  z.strictObject({ bound: z.string().min(1) }),
]);

/** A set of zones. `unoccupied` never includes the own monster's zone (Q5). */
export const ZoneSetSchema = z.union([
  z.array(ZoneSchema).min(1),
  z.strictObject({
    relation: z.enum(["adjacentTo", "sameColumnAs", "inFrontOf", "behind"]),
    of: ZoneAnchorSchema,
    includeSelf: z.boolean().optional(),
  }),
  z.enum(["unoccupied", "any"]),
]);
export type ZoneSet = z.infer<typeof ZoneSetSchema>;

export const SelectorSchema = z.strictObject({
  owner: PlayerRefSchema,
  area: z.enum([
    "zones",
    "hand",
    "deck",
    "discard",
    "strategy",
    "monster",
    "monsterDeck",
    "under",
    "bound",
  ]),
  this: z.literal(true).optional(),
  /** Excludes the source card (Q6). */
  other: z.literal(true).optional(),
  type: z.enum(["Monster", "Battle", "Strategy"]).optional(),
  name: z.string().min(1).optional(),
  /** Every listed trait must be present. */
  traits: z.array(z.string().min(1)).min(1).optional(),
  keyword: z.string().min(1).optional(),
  /** Any listed color matches. */
  colors: z
    .array(z.enum(["Red", "Blue", "Green", "White"]))
    .min(1)
    .optional(),
  rank: z
    .strictObject({
      op: OpSchema,
      value: z.union([z.number().int(), ValueRefSchema]),
    })
    .optional(),
  zones: ZoneSetSchema.optional(),
  /** Threat of a monster card (its player's threat while it is the invading monster). */
  threat: z.strictObject({ op: OpSchema, value: z.number().int() }).optional(),
  /** Counter power of a battle card, through the 10.8.1 layers. */
  counterPower: z
    .strictObject({ op: OpSchema, value: z.number().int() })
    .optional(),
  /** Part of the card's name ("with \"MB\" in their name"). */
  nameIncludes: z.string().min(1).optional(),
  /** At least one listed trait must be present ("[gigan] or [megalon]"). */
  anyTraits: z.array(z.string().min(1)).min(1).optional(),
  /** The number on the card's invasion icon ("a card with [invade-2]"). */
  invadeIcon: z.number().int().nonnegative().optional(),
  /** With `area: "bound"`: the name a card was bound to with `as`. */
  bind: z.string().min(1).optional(),
});
export type Selector = z.infer<typeof SelectorSchema>;

/** An amount read from the game ("for each ..."), as opposed to a fixed number. */
const AmountReadSchema = z.union([
  z.strictObject({ per: SelectorSchema, times: z.number().int() }),
  /** Per point of a player's rage ("for each of your opponent's [rage]"). */
  z.strictObject({ rageOf: PlayerRefSchema, times: z.number().int() }),
  /** Per rank of a player's invading monster. */
  z.strictObject({ monsterRankOf: PlayerRefSchema, times: z.number().int() }),
  /** Per zone of a player's with no card, not counting the zone their monster occupies. */
  z.strictObject({
    unoccupiedZonesOf: PlayerRefSchema,
    times: z.number().int(),
  }),
  ValueRefSchema,
]);

export const AmountSchema = z.union([z.number().int(), AmountReadSchema]);
export type Amount = z.infer<typeof AmountSchema>;

export const CountSchema = z.union([
  /** "Exactly N"; an amount for "1 for each ..." (a count of 0 picks nothing). */
  z.strictObject({
    exact: z.union([z.number().int().positive(), AmountReadSchema]),
  }),
  z.strictObject({ upTo: z.number().int().positive() }),
  z.literal("all"),
  z.literal("anyNumber"),
]);
export type Count = z.infer<typeof CountSchema>;

export const ChooserSchema = z.enum(["you", "opponent"]);

export const GateSchema = z.discriminatedUnion("gate", [
  z.strictObject({ gate: z.literal("turn"), whose: WhoseSchema }),
  z.strictObject({ gate: z.literal("awakening"), zone: ZoneSchema }),
]);
export type Gate = z.infer<typeof GateSchema>;

export const TriggerSchema = z.discriminatedUnion("on", [
  z.strictObject({ on: z.literal("enter") }),
  z.strictObject({ on: z.literal("invading") }),
  z.strictObject({ on: z.literal("placedInStrategyZone") }),
  z.strictObject({
    on: z.literal("phaseBegins"),
    phase: PhaseSchema,
    whose: z.enum(["yours", "opponents", "either"]),
  }),
  /**
   * A card is destroyed (5.12, 11.3, 11.5). `what` is matched against the card's last known
   * information on the field (10.6.4.1.2); `as` binds it for the effects (10.10).
   */
  z.strictObject({
    on: z.literal("destroyed"),
    what: SelectorSchema,
    cause: z.enum(["effect", "crush", "overload"]).optional(),
    /** Whose effect destroyed it (with `cause: "effect"` or none). */
    by: PlayerRefSchema.optional(),
    /** Only a crush caused by an advance of an invasion ([invading] ... destroys, 12.3). */
    invasion: z.literal(true).optional(),
    as: z.string().min(1).optional(),
  }),
  /**
   * A card goes to the discard pile from a hand (5.7, 8.4.1, 8.6.1.1) or a strategy zone (7.2.3,
   * 5.12). `what` is matched against the card in the discard pile.
   */
  z.strictObject({
    on: z.literal("discarded"),
    what: SelectorSchema,
    from: z.enum(["hand", "strategy"]),
    cause: z.enum(["effect", "cost", "invasion", "rage"]).optional(),
    byOpponentEffect: z.boolean().optional(),
    as: z.string().min(1).optional(),
  }),
  z.strictObject({
    on: z.literal("rageChanged"),
    whose: PlayerRefSchema,
    change: z.enum(["increased", "reduced", "setToZero"]),
  }),
  z.strictObject({
    on: z.literal("cardPlayed"),
    by: PlayerRefSchema,
    what: SelectorSchema,
  }),
  /** An invading monster is countered (5.15): `this` card, or a player's monster. */
  z.strictObject({
    on: z.literal("countered"),
    whose: z.union([z.literal("this"), PlayerRefSchema]),
  }),
  /** An invading monster advances (5.13.1), whatever caused it; one match per zone advanced. */
  z.strictObject({
    on: z.literal("advanced"),
    whose: z.union([z.literal("this"), PlayerRefSchema]),
    toZone: ZoneSchema.optional(),
    /** It advanced into the same column as the opponent's monster (4.4.5.4). */
    intoColumnOf: z.literal("opponentMonster").optional(),
    during: PhaseSchema.optional(),
  }),
  /** A player performs an invasion (5.14.1, 8.6): once per invasion action, unlike [invading]. */
  z.strictObject({
    on: z.literal("invades"),
    whose: PlayerRefSchema,
    /** The monster entered one of these zones during the invasion. */
    intoZones: z.array(ZoneSchema).min(1).optional(),
  }),
  z.strictObject({ on: z.literal("gameStarts") }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { rage: PlayerRef; op: Op; value: number }
  | { zoneOf: "this" | "yourMonster" | "opponentMonster"; in: ZoneSet }
  | { count: Selector; op: Op; value: number }
  | { monsterRank: PlayerRef; op: Op; value: number }
  | { playedVia: "evolution" | "burst" | "effect" | "hand" }
  | { didLastStep: true };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ConditionSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionSchema).min(1) }),
    z.strictObject({ not: ConditionSchema }),
    z.strictObject({
      rage: PlayerRefSchema,
      op: OpSchema,
      value: z.number().int(),
    }),
    z.strictObject({
      zoneOf: z.enum(["this", "yourMonster", "opponentMonster"]),
      in: ZoneSetSchema,
    }),
    z.strictObject({
      count: SelectorSchema,
      op: OpSchema,
      value: z.number().int(),
    }),
    z.strictObject({
      monsterRank: PlayerRefSchema,
      op: OpSchema,
      value: z.number().int(),
    }),
    z.strictObject({
      playedVia: z.enum(["evolution", "burst", "effect", "hand"]),
    }),
    z.strictObject({ didLastStep: z.literal(true) }),
  ]),
);

const DestroyTargetSchema = z.strictObject({
  select: SelectorSchema,
  count: CountSchema,
  chooser: ChooserSchema,
});

/** Every effect may bind what it touched with `as`, for later effects of one resolution. */
const asField = { as: z.string().min(1).optional() };

export type Effect =
  | {
      effect: "destroy";
      target: z.infer<typeof DestroyTargetSchema>;
      oneByOne?: boolean | undefined;
      as?: string | undefined;
    }
  | {
      effect: "discard";
      player: EffectPlayer;
      count: Count;
      filter?: Selector | undefined;
      chooser: "you" | "opponent";
      as?: string | undefined;
    }
  | {
      effect: "discardDownTo";
      player: EffectPlayer;
      size: number;
      as?: string | undefined;
    }
  | {
      effect: "rage";
      player: EffectPlayer;
      delta: Amount;
      as?: string | undefined;
    }
  | {
      effect: "setRage";
      player: EffectPlayer;
      value: number;
      as?: string | undefined;
    }
  | {
      effect: "search";
      player: EffectPlayer;
      filter: Selector;
      count: Count;
      reveal?: boolean | undefined;
      effects: Effect[];
      as?: string | undefined;
    }
  | {
      effect: "play";
      from: Selector["area"];
      filter: Selector;
      count: Count;
      zones?: ZoneSet | undefined;
      asManyAsPossible?: boolean | undefined;
      preferEmpty?: boolean | undefined;
      ignoreRankLimit?: boolean | undefined;
      as?: string | undefined;
    }
  | { effect: "addToHand"; target: Selector; as?: string | undefined }
  | { effect: "shuffle"; player: EffectPlayer; as?: string | undefined }
  | {
      effect: "draw";
      player: EffectPlayer;
      count: Amount;
      as?: string | undefined;
    }
  | {
      effect: "moveBattle";
      target: Selector;
      to: ZoneSet;
      optional?: boolean | undefined;
      as?: string | undefined;
    }
  | {
      effect: "putOnDeck";
      target: Selector;
      where: "top" | "bottom";
      as?: string | undefined;
    }
  | { effect: "evolve"; target: Selector; as?: string | undefined }
  | { effect: "chooseZone"; owner: "you" | "opponent"; as: string }
  | {
      effect: "advance";
      player: EffectPlayer;
      by?: number | undefined;
      toZone?: Zone | undefined;
      as?: string | undefined;
    }
  | {
      effect: "retreat";
      player: EffectPlayer;
      by?: number | undefined;
      toZone?: Zone | undefined;
      as?: string | undefined;
    }
  | {
      effect: "mill";
      player: EffectPlayer;
      count: number;
      as?: string | undefined;
    }
  | {
      effect: "revealTop";
      player: EffectPlayer;
      count: Amount;
      effects: Effect[];
      as?: string | undefined;
    }
  | {
      effect: "lookTop";
      player: EffectPlayer;
      count: Amount;
      effects: Effect[];
      as?: string | undefined;
    }
  | {
      effect: "placeUnder";
      target: Selector;
      under: Selector;
      as?: string | undefined;
    }
  | {
      effect: "returnToHand";
      from: "discard";
      target: Selector;
      as?: string | undefined;
    }
  | {
      effect: "createToken";
      name: string;
      zones: ZoneSet;
      as?: string | undefined;
    }
  | { effect: "chooseOne"; options: Effect[][]; as?: string | undefined }
  | {
      effect: "until";
      duration: "endOfTurn";
      abilities: DelayedAbility[];
      as?: string | undefined;
    }
  | { effect: "custom"; handler: string; as?: string | undefined };

/** A triggered ability an `until` effect creates for a while (a timed trigger, 10.6.5). */
export interface DelayedAbility {
  kind: "triggered";
  id: string;
  gates?: Gate[] | undefined;
  trigger: Trigger;
  condition?: Condition | undefined;
  optional?: boolean | undefined;
  effects: Effect[];
}

export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion("effect", [
    z.strictObject({
      effect: z.literal("destroy"),
      target: DestroyTargetSchema,
      oneByOne: z.boolean().optional(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("discard"),
      player: EffectPlayerSchema,
      count: CountSchema,
      filter: SelectorSchema.optional(),
      chooser: ChooserSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("discardDownTo"),
      player: EffectPlayerSchema,
      size: z.number().int().nonnegative(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("rage"),
      player: EffectPlayerSchema,
      delta: AmountSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("setRage"),
      player: EffectPlayerSchema,
      value: z.number().int().nonnegative(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("search"),
      player: EffectPlayerSchema,
      filter: SelectorSchema,
      count: CountSchema,
      reveal: z.boolean().optional(),
      effects: z.array(EffectSchema),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("play"),
      from: SelectorSchema.shape.area,
      filter: SelectorSchema,
      count: CountSchema,
      zones: ZoneSetSchema.optional(),
      asManyAsPossible: z.boolean().optional(),
      preferEmpty: z.boolean().optional(),
      /** Defaults to true: 8.2.1 limits only the main phase action. */
      ignoreRankLimit: z.boolean().optional(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("addToHand"),
      target: SelectorSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("shuffle"),
      player: EffectPlayerSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("draw"),
      player: EffectPlayerSchema,
      count: AmountSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("moveBattle"),
      target: SelectorSchema,
      to: ZoneSetSchema,
      optional: z.boolean().optional(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("putOnDeck"),
      target: SelectorSchema,
      where: z.enum(["top", "bottom"]),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("evolve"),
      target: SelectorSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("chooseZone"),
      owner: ChooserSchema,
      as: z.string().min(1),
    }),
    z.strictObject({
      effect: z.literal("advance"),
      player: EffectPlayerSchema,
      by: z.number().int().positive().optional(),
      toZone: ZoneSchema.optional(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("retreat"),
      player: EffectPlayerSchema,
      by: z.number().int().positive().optional(),
      toZone: ZoneSchema.optional(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("mill"),
      player: EffectPlayerSchema,
      count: z.number().int().positive(),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("revealTop"),
      player: EffectPlayerSchema,
      count: AmountSchema,
      effects: z.array(EffectSchema),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("lookTop"),
      player: EffectPlayerSchema,
      count: AmountSchema,
      effects: z.array(EffectSchema),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("placeUnder"),
      target: SelectorSchema,
      under: SelectorSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("returnToHand"),
      from: z.literal("discard"),
      target: SelectorSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("createToken"),
      name: z.string().min(1),
      zones: ZoneSetSchema,
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("chooseOne"),
      options: z.array(z.array(EffectSchema).min(1)).min(2),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("until"),
      duration: z.literal("endOfTurn"),
      abilities: z
        .array(
          z.strictObject({
            kind: z.literal("triggered"),
            id: z.string().min(1),
            gates: z.array(GateSchema).optional(),
            trigger: TriggerSchema,
            condition: ConditionSchema.optional(),
            optional: z.boolean().optional(),
            effects: z.array(EffectSchema).min(1),
          }),
        )
        .min(1),
      ...asField,
    }),
    z.strictObject({
      effect: z.literal("custom"),
      handler: z.string().min(1),
      ...asField,
    }),
  ]),
);

export const ModifierSchema = z.union([
  z.strictObject({
    stat: z.enum(["counterPower", "threat", "rank"]),
    target: SelectorSchema,
    amount: AmountSchema,
  }),
  z.strictObject({
    stat: z.literal("totalCounterPower"),
    amount: AmountSchema,
  }),
  z.strictObject({
    flag: z.enum([
      "cannotEngage",
      "cannotBeDestroyedByOpponent",
      "cannotAdvanceOrInvade",
      "cannotBeCounteredAtOrBelow",
      "rageCannotBeReduced",
    ]),
    target: SelectorSchema,
    value: z.number().int().optional(),
  }),
]);
export type Modifier = z.infer<typeof ModifierSchema>;

export const CostSchema = z.strictObject({
  optional: z.boolean(),
  effects: z.array(EffectSchema).min(1),
});
export type Cost = z.infer<typeof CostSchema>;

export const ReplaceableEventSchema = z.strictObject({
  event: z.literal("destroyed"),
  what: SelectorSchema,
});
export type ReplaceableEvent = z.infer<typeof ReplaceableEventSchema>;

/** Keyword abilities written as data; the engine expands them (12.5, 12.6, 12.7, 12.8, 12.9). */
export const KeywordAbilitySchema = z.discriminatedUnion("name", [
  z.strictObject({
    name: z.literal("burst"),
    rank: z.number().int().min(1).max(4),
  }),
  z.strictObject({
    name: z.literal("evolution"),
    rank: z.number().int().positive(),
    trait: z.string().min(1),
  }),
  z.strictObject({
    name: z.literal("base"),
    effects: z.array(EffectSchema).optional(),
  }),
  z.strictObject({
    name: z.literal("revenge"),
    effects: z.array(EffectSchema).min(1),
  }),
  z.strictObject({
    name: z.literal("resonance"),
    colors: z.array(z.enum(["Red", "Blue", "Green", "White"])).min(2),
  }),
]);
export type KeywordAbility = z.infer<typeof KeywordAbilitySchema>;

export const AbilitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("triggered"),
    id: z.string().min(1),
    gates: z.array(GateSchema).optional(),
    trigger: TriggerSchema,
    /** Areas besides the field where the ability is active (10.3.4): "when this card is discarded". */
    activeIn: z
      .array(z.enum(["hand", "discard"]))
      .min(1)
      .optional(),
    condition: ConditionSchema.optional(),
    optional: z.boolean().optional(),
    cost: CostSchema.optional(),
    effects: z.array(EffectSchema).min(1),
  }),
  z.strictObject({
    kind: z.literal("continuous"),
    id: z.string().min(1),
    gates: z.array(GateSchema).optional(),
    condition: ConditionSchema.optional(),
    modifiers: z.array(ModifierSchema).min(1),
  }),
  z.strictObject({
    kind: z.literal("replacement"),
    id: z.string().min(1),
    gates: z.array(GateSchema).optional(),
    replaces: ReplaceableEventSchema,
    condition: ConditionSchema.optional(),
    optional: z.boolean().optional(),
    instead: z.array(EffectSchema).min(1),
  }),
  z.strictObject({ kind: z.literal("keyword"), keyword: KeywordAbilitySchema }),
]);
export type Ability = z.infer<typeof AbilitySchema>;

/** Deck construction rules on a card (Q13, Resonance 12.8). */
export const DeckRuleSchema = z.discriminatedUnion("rule", [
  z.strictObject({ rule: z.literal("anyNumber") }),
  z.strictObject({
    rule: z.literal("resonance"),
    colors: z.array(z.enum(["Red", "Blue", "Green", "White"])).min(2),
    conditions: z.array(z.string().min(1)),
  }),
]);
export type DeckRule = z.infer<typeof DeckRuleSchema>;

export const AbilityStatusSchema = z.enum(["implemented", "partial", "manual"]);
export type AbilityStatus = z.infer<typeof AbilityStatusSchema>;

export const CardAbilitiesSchema = z
  .strictObject({
    deckCardNumber: z.string().min(1),
    status: AbilityStatusSchema,
    abilities: z.array(AbilitySchema),
    deckRules: z.array(DeckRuleSchema).optional(),
    notes: z.string().min(1).optional(),
  })
  .superRefine((card, ctx) => {
    const ids = card.abilities.flatMap((a) => ("id" in a ? [a.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: `${card.deckCardNumber}: duplicate ability id`,
      });
  });
export type CardAbilities = z.infer<typeof CardAbilitiesSchema>;

/** One set's file: `deckCardNumber` -> abilities. */
export const AbilityFileSchema = z
  .record(z.string().min(1), CardAbilitiesSchema)
  .superRefine((file, ctx) => {
    for (const [key, card] of Object.entries(file))
      if (key !== card.deckCardNumber)
        ctx.addIssue({
          code: "custom",
          message: `key ${key} holds ${card.deckCardNumber}`,
        });
  });
export type AbilityFile = z.infer<typeof AbilityFileSchema>;

/** The set files, by set code. Each new set file is added here. */
export const ABILITY_FILES: Record<string, unknown> = {
  EBP01: ebp01,
  EBP02: ebp02,
  EBP03: ebp03,
  EBP04: ebp04,
  ESD01: esd01,
  ESD02: esd02,
};

let loaded: Map<string, CardAbilities> | null = null;

/** Every set file, validated once on first use. Throws on invalid data. */
export function loadAbilities(): Map<string, CardAbilities> {
  if (loaded) return loaded;
  const map = new Map<string, CardAbilities>();
  for (const [set, raw] of Object.entries(ABILITY_FILES)) {
    const result = AbilityFileSchema.safeParse(raw);
    if (!result.success)
      throw new Error(
        `abilities/${set}.json is invalid: ${result.error.message}`,
      );
    for (const [number, card] of Object.entries(result.data))
      map.set(number, card);
  }
  loaded = map;
  return map;
}

/** A card's abilities by `deckCardNumber`. A card with no entry is `manual` with no abilities. */
export function getCardAbilities(deckCardNumber: string): CardAbilities {
  return (
    loadAbilities().get(deckCardNumber) ?? {
      deckCardNumber,
      status: "manual",
      abilities: [],
    }
  );
}
