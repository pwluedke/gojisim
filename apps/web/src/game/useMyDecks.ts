import { useEffect, useRef, useState } from "react";
import { fetchMe } from "../account";
import {
  type AccountApi,
  accountApi,
  answerOffer,
  type ClashChoice,
  freeName,
  fromAccount,
  mergeDecks,
  offerAnswered,
  type UploadPlan,
  uploadPlan,
} from "./accountSync";
import { type DeckStore, deckStore, type SavedDeck } from "./deckStore";

/**
 * The player's saved decks (M7a), loaded once from IndexedDB. Every change shows at once and is
 * saved; when storage is unavailable the decks still work for this visit, with a note saying so.
 *
 * #152: signed in with Discord, the decks follow the player. After the local load the account's
 * decks are merged in (the newest edit wins; a deck deleted elsewhere goes), every change is sent
 * to the account too, and this browser's decks the account doesn't have are offered once for
 * upload (`offer`), with a choice for each name the account already uses.
 */
export function useMyDecks(
  store: DeckStore = deckStore(),
  api: AccountApi = accountApi(),
  me: () => Promise<{ id: string } | null> = fetchMe,
) {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Storage writes in flight; 0 once what is stored matches what shows.
  const [pending, setPending] = useState(0);
  const [offer, setOffer] = useState<UploadPlan | null>(null);
  const storeRef = useRef(store);
  const apiRef = useRef(api);
  /** The signed-in player's id once the account answered (decks then go to the account too). */
  const player = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      let saved: SavedDeck[] = [];
      try {
        saved = await storeRef.current.list();
        if (live) setDecks((now) => mergeById(saved, now));
      } catch {
        if (live) setPersistent(false);
      }
      if (live) setLoaded(true);
      const who = await me();
      const remote = who ? await apiRef.current.decks() : null;
      if (!live || !who || !remote) return;
      player.current = who.id;
      const merged = mergeDecks(saved, remote);
      setDecks((now) =>
        mergeById(
          merged.decks,
          now.filter((d) => !saved.some((s) => s.id === d.id)),
        ),
      );
      // This browser's cache follows: the account's decks in, deleted ones out.
      const kept = new Set(merged.decks.map((d) => d.id));
      for (const deck of merged.decks) void storeRef.current.put(deck);
      for (const gone of saved.filter((d) => !kept.has(d.id)))
        void storeRef.current.remove(gone.id);
      for (const deck of merged.push) void apiRef.current.putDeck(deck);
      if (merged.localOnly.length > 0 && !offerAnswered(who.id)) {
        const accountDecks = remote
          .filter((d) => !d.deleted)
          .map((d) => fromAccount(d));
        setOffer(uploadPlan(merged.localOnly, accountDecks));
      }
    })();
    return () => {
      live = false;
    };
  }, [me]);

  const keep = (work: Promise<boolean>) => {
    setPending((n) => n + 1);
    void work
      .then((ok) => {
        if (!ok) setPersistent(false);
      })
      .finally(() => setPending((n) => n - 1));
  };
  /** Sends a change to the account when signed in. */
  const sync = (deck: SavedDeck) => {
    if (player.current) void apiRef.current.putDeck(deck);
  };

  const add = (...added: SavedDeck[]) => {
    const now = new Date().toISOString();
    const stamped = added.map((d) => ({ ...d, updatedAt: d.updatedAt ?? now }));
    setDecks((current) => [...current, ...stamped]);
    for (const deck of stamped) {
      keep(storeRef.current.put(deck));
      sync(deck);
    }
  };
  const rename = (id: string, name: string) => {
    const deck = decks.find((d) => d.id === id);
    if (!deck || !name.trim()) return;
    const renamed: SavedDeck = {
      ...deck,
      name: name.trim(),
      list: deck.list.replace(/^\[deck\].*$/m, `[deck] ${name.trim()}`),
      savedAt: deck.savedAt,
      updatedAt: new Date().toISOString(),
    };
    setDecks((now) => now.map((d) => (d.id === id ? renamed : d)));
    keep(storeRef.current.put(renamed));
    sync(renamed);
  };
  const remove = (id: string) => {
    setDecks((now) => now.filter((d) => d.id !== id));
    keep(storeRef.current.remove(id));
    if (player.current)
      void apiRef.current.deleteDeck(id, new Date().toISOString());
  };

  /**
   * The upload offer's answer: the plain uploads go up; each clash as chosen (`both` keeps this
   * browser's deck under a free name, `account` drops this browser's copy, `browser` puts this
   * browser's deck in the account's place). It isn't offered again in this browser.
   */
  const acceptOffer = (choices: Record<string, ClashChoice>) => {
    const plan = offer;
    const who = player.current;
    if (!plan || !who) return;
    const now = new Date().toISOString();
    for (const deck of plan.upload)
      void apiRef.current.putDeck({ ...deck, updatedAt: now });
    let names = decks.map((d) => d.name);
    for (const { local, account } of plan.clashes) {
      const choice = choices[local.id] ?? "both";
      if (choice === "both") {
        const name = freeName(local.name, names);
        names = [...names, name];
        // The rename is saved here and sent to the account (signed in).
        rename(local.id, name);
      } else if (choice === "account") {
        setDecks((current) => current.filter((d) => d.id !== local.id));
        keep(storeRef.current.remove(local.id));
      } else {
        const replaced: SavedDeck = {
          ...account,
          list: local.list,
          updatedAt: now,
        };
        setDecks((current) =>
          current
            .filter((d) => d.id !== local.id)
            .map((d) => (d.id === account.id ? replaced : d)),
        );
        keep(storeRef.current.remove(local.id));
        keep(storeRef.current.put(replaced));
        void apiRef.current.putDeck(replaced);
      }
    }
    answerOffer(who);
    setOffer(null);
  };
  /** "Not now": this browser's decks stay here only, and it isn't offered again. */
  const declineOffer = () => {
    if (player.current) answerOffer(player.current);
    setOffer(null);
  };

  return {
    decks,
    persistent,
    loaded,
    stored: loaded && pending === 0,
    add,
    rename,
    remove,
    offer,
    acceptOffer,
    declineOffer,
  };
}

/** Saved decks plus any added before they loaded (this visit's), without duplicates. */
function mergeById(saved: SavedDeck[], now: SavedDeck[]): SavedDeck[] {
  const ids = new Set(saved.map((d) => d.id));
  return [...saved, ...now.filter((d) => !ids.has(d.id))];
}
