# Comprehensive Rules

- **Source URL (official):** https://en.godzilla-cardgame.com/wordpress/wp-content/uploads/2026/05/28103033/260527-v1.2-Godzilla-TCG-Comprehensive-Rules.pdf
- **Snapshot URL:** none. The official site returned HTTP 503 (maintenance) on 2026-10-21, and the Internet Archive has no snapshot of this file (it only has v1.1).
- **Copy used:** Paul's local download of the official file. macOS download metadata (`kMDItemWhereFroms`) records the official URL above. The PDF header reads "Comprehensive Rules ver. 1.2, Last Updated: May 27, 2026" (14 pages).
- **SHA-256** of `comprehensive-rules-v1.2.pdf`: `52ed6d8abd27b0f95facf3aa7faeb9d40d107de774ec44ebb7fba3f7c79d9b58`

## Files

| File                           | Contents                                                  |
| ------------------------------ | --------------------------------------------------------- |
| `comprehensive-rules-v1.2.pdf` | The official PDF, unchanged.                              |
| `comprehensive-rules-v1.2.txt` | Plain-text extraction, with `===== Page N =====` markers. |

## How the text was extracted

The PDF is laid out in two columns. Running `pdftotext -layout` on whole pages interleaves the columns line by line, so each page was extracted as two crops, left column then right column:

```sh
pdftotext -layout -f N -l N -x 0   -y 0 -W 300 -H 842 comprehensive-rules-v1.2.pdf -   # left
pdftotext -layout -f N -l N -x 300 -y 0 -W 296 -H 842 comprehensive-rules-v1.2.pdf -   # right
```

Cleanup:

- removed invisible U+200E (left-to-right mark) characters
- replaced U+200B (zero-width space) with a space where it was the only separator, e.g. `6.1.1.4.​The` → `6.1.1.4. The`
- stripped trailing spaces and collapsed runs of blank lines

Checks:

- the word count matches an uncropped `pdftotext` extraction exactly (10,274 words; nothing lost or split at the column boundary)
- rule numbers at line starts appear in ascending order; the only exceptions are cross-references that wrap onto a new line
- spot-checked rules 6.1.1.4 and 5.15.1.1

Known quirks of the source PDF (kept verbatim):

- some rules repeat their own number, e.g. `1.3.1. 1.3.1. If the comprehensive rules…`
- the card-anatomy diagram labels on page 2 appear as loose lines in the left column
