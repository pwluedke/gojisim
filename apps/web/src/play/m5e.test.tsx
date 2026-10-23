import { readFileSync } from "node:fs";
import { getAllCards } from "@gojisim/cards/test-decks";
import type { Action, GameState } from "@gojisim/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { abilityText, describeSearch } from "../game/labels";
import { sessionFromRecord, withAction } from "../game/session";
import { CardFace } from "./CardFace";
import { ChoiceModal } from "./ChoiceModal";
import { searchResults } from "./searches";

const fixture = (name: string) =>
  sessionFromRecord(
    readFileSync(
      new URL(`../../e2e/fixtures/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

const card = (deckCardNumber: string) => {
  const found = getAllCards()
    .filter((c) => c.deckCardNumber === deckCardNumber && c.parentId === null)
    .sort((a, b) => a.id - b.id)[0];
  if (!found) throw new Error(deckCardNumber);
  return found;
};

/** A state whose catalog holds the given cards. */
const withCards = (...numbers: string[]): GameState => {
  const session = fixture("target");
  const state = session.states[session.position] as GameState;
  const cards = { ...state.cards };
  for (const n of numbers) cards[card(n).id] = card(n);
  return { ...state, cards };
};

describe("ability text (M5e ability-order modal)", () => {
  it("each ability's own line of the card text, in ability-data order", () => {
    const state = withCards("ESD01-011", "ESD01-012", "ESD01-002");
    expect(abilityText(state, "ESD01-011#bottom-instead")).toBe(
      "When this card is [destroy], place this card on the bottom of your deck instead.",
    );
    expect(abilityText(state, "ESD01-011#enter-rage")).toMatch(/^\[enter\]/);
    expect(abilityText(state, "ESD01-012#zone8-bonus")).toBe(
      "If this card is in zone 8, this card gains +3000 counter power.",
    );
    expect(abilityText(state, "ESD01-002#invading-search")).toMatch(
      /^\[invading\] Search your deck/,
    );
  });

  it("standbyOrder: the modal shows each ability's text above its card", () => {
    const state = withCards("ESD01-011", "ESD01-012");
    state.pendingChoice = {
      id: 77,
      player: "P1",
      kind: "standbyOrder",
      rule: "10.4.3.2",
      options: [
        {
          id: "s1",
          cardId: card("ESD01-011").id,
          abilityId: "ESD01-011#enter-rage",
        },
        {
          id: "s2",
          cardId: card("ESD01-012").id,
          abilityId: "ESD01-012#play-move",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ChoiceModal
        state={state}
        heading="h"
        source={null}
        actions={state.pendingChoice.options.map((o): Action => ({
          type: "choose",
          player: "P1",
          choiceId: 77,
          optionId: o.id,
        }))}
        manualCards={[]}
        onAction={() => {}}
        labelOf={(a) => a.type}
      />,
    );
    expect(html.match(/data-testid="choice-ability-text"/g)).toHaveLength(2);
    expect(html).toContain("reduce your opponent&#x27;s [rage] by 1");
    expect(html).toContain("you may move this card to an unoccupied zone");
  });
});

describe("search modal (M5e)", () => {
  it("describes what a search looks for", () => {
    expect(
      describeSearch(
        {
          owner: "you",
          area: "deck",
          rank: { op: "=", value: 3 },
          name: "Godzilla (2023)",
          keyword: "burst",
        },
        { upTo: 1 },
      ),
    ).toBe("up to 1 card named Godzilla (2023) of rank 3 with Burst");
    expect(
      describeSearch(
        {
          owner: "you",
          area: "deck",
          type: "Battle",
          traits: ["Mothra"],
          rank: { op: "<=", value: 4 },
        },
        { exact: 1 },
      ),
    ).toBe("1 battle card with the Mothra trait of rank 4 or lower");
  });

  it("a finished search names its source, what it wanted, and the cards the searcher picked", () => {
    const session = fixture("search");
    const state = session.states[session.position] as GameState;
    const choice = state.pendingChoice;
    if (!choice) throw new Error("no choice");
    const seen = state.log.length;
    const pick = (optionId: string) =>
      withAction(session, {
        type: "choose",
        player: choice.player,
        choiceId: choice.id,
        optionId,
      });
    const option = choice.options.find((o) => o.id !== "done");
    const found = searchResults(pick(option?.id ?? ""), seen, ["P1"]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      player: "P1",
      found: [option?.cardId],
    });
    expect(found[0]?.sourceCardId).not.toBeNull();
    expect(found[0]?.wanted).toMatch(/^up to 1 /);
    const nothing = searchResults(pick("done"), seen, ["P1"]);
    expect(nothing[0]?.found).toEqual([]);
    // Bot searches never open the modal.
    expect(searchResults(pick("done"), seen, ["P2"])).toEqual([]);
  });
});

describe("strategy card orientation (M5e)", () => {
  it("a strategy card rotates where asked (hand, discard top); a battle card never does", () => {
    const strategy = card("ESD01-014");
    const battle = card("ESD01-011");
    const render = (data: typeof strategy, rotate: boolean) =>
      renderToStaticMarkup(
        <CardFace
          card={{ instanceId: "c1", cardId: data.id, owner: "P1" } as never}
          data={data}
          rotate={rotate}
        />,
      );
    expect(render(strategy, true)).toContain('data-rotated="true"');
    expect(render(strategy, false)).not.toContain("data-rotated");
    expect(render(battle, true)).not.toContain("data-rotated");
  });
});
