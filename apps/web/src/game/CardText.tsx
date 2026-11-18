import styles from "./CardText.module.css";
import { keywordParts, tagLabel } from "./keywordTags";

/** Card text with its keyword abilities as bordered tags (the preview and the Deckbuilder). */
export function CardText({ text }: { text: string }) {
  return (
    <>
      {keywordParts(text).map((part, i) =>
        part.tag ? (
          <span key={i} className={styles.keywordTag} data-testid="keyword-tag">
            {tagLabel(part.text)}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
