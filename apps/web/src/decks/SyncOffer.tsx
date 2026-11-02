import { useState } from "react";
import type { ClashChoice } from "../game/accountSync";
import type { useMyDecks } from "../game/useMyDecks";
import styles from "./SyncOffer.module.css";

/**
 * #152: the first sign-in's offer in a browser with its own decks (in the Deckbuilder since #161, where decks are managed): upload them to the account,
 * with a choice for each deck whose name the account already uses for a different deck. "Not
 * now" keeps them in this browser only. Asked once per browser and player.
 */
export function SyncOffer({ my }: { my: ReturnType<typeof useMyDecks> }) {
  const offer = my.offer;
  const [choices, setChoices] = useState<Record<string, ClashChoice>>({});
  if (!offer) return null;
  const count = offer.upload.length + offer.clashes.length;
  return (
    <div
      className={styles.syncOffer}
      data-testid="sync-offer"
      role="group"
      aria-label="Keep these decks with your account"
    >
      <strong>Keep this browser's decks with your account?</strong>
      <p>
        {count === 0
          ? "Your account already has every deck saved here."
          : `${count} deck${count === 1 ? "" : "s"} saved in this browser ${count === 1 ? "isn't" : "aren't"} in your account yet. Upload ${count === 1 ? "it" : "them"} to play ${count === 1 ? "it" : "them"} on any browser.`}
      </p>
      {offer.clashes.map(({ local }) => (
        <label
          key={local.id}
          className={styles.syncClash}
          data-testid="sync-clash"
        >
          Your account already has a different "{local.name}":{" "}
          <select
            value={choices[local.id] ?? "both"}
            onChange={(e) =>
              setChoices((c) => ({
                ...c,
                [local.id]: e.target.value as ClashChoice,
              }))
            }
          >
            <option value="both">Keep both</option>
            <option value="account">Keep the account's</option>
            <option value="browser">Use this browser's</option>
          </select>
        </label>
      ))}
      <div className={styles.syncActions}>
        <button
          type="button"
          data-testid="sync-upload"
          onClick={() => my.acceptOffer(choices)}
        >
          Upload
        </button>
        <button
          type="button"
          data-testid="sync-not-now"
          onClick={() => my.declineOffer()}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
