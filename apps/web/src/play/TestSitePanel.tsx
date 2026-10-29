import type { Settings } from "./settings";
import styles from "./Board.module.css";

/** The radiation trefoil at both ends of the panel's title: a hub and three blades. */
function Trefoil() {
  // Three 60° blades between radii 3.2 and 10, 120° apart, around a hub of radius 2.2.
  const blade = (start: number) => {
    const at = (deg: number, r: number) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
    };
    return `M ${at(start, 3.2)} L ${at(start, 10)} A 10 10 0 0 1 ${at(start + 60, 10)} L ${at(start + 60, 3.2)} A 3.2 3.2 0 0 0 ${at(start, 3.2)} Z`;
  };
  return (
    <svg
      className={styles.trefoil}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      data-testid="trefoil"
    >
      <circle cx="12" cy="12" r="11.5" className={styles.trefoilDisc} />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      {[-30, 90, 210].map((start) => (
        <path key={start} d={blade(start)} fill="currentColor" />
      ))}
    </svg>
  );
}

export interface TestSitePanelProps {
  settings: Settings;
  updateSettings: (change: Partial<Settings>) => void;
  /** Good Bot! and Bad Bot! are live once the bot has made an action. */
  badBotReady: boolean;
  onBadBot: () => void;
  onGoodBot: () => void;
  /** Report bug waits while no game record exists (the First / Second pick). */
  reportReady: boolean;
  onReportBug: () => void;
  /** A line under the buttons: the Report bug file note, or the Bad Bot! send result. */
  note: string | null;
  /** Show opponent's hand applies (a human seat plays a bot). */
  canShowHand: boolean;
  showHand: boolean;
  /** Turning it on asks first; turning it off is immediate. */
  onShowHand: (on: boolean) => void;
}

/**
 * The Test Site panel (M13b), under Settings in the left column: Report bug on its own row, then
 * Good Bot! and Bad Bot! side by side, always shown; "Test settings" (sharing, the opponent's hand, the "Which button?" help) folds away, open
 * or closed as last left. It renders only while the Test Site is on (`testSiteEnabled`).
 */
export function TestSitePanel({
  settings,
  updateSettings,
  badBotReady,
  onBadBot,
  onGoodBot,
  reportReady,
  onReportBug,
  note,
  canShowHand,
  showHand,
  onShowHand,
}: TestSitePanelProps) {
  return (
    <section className={styles.testSite} data-testid="test-site">
      <h2 className={styles.testSiteTitle}>
        <Trefoil />
        <span>Test Site</span>
        <Trefoil />
      </h2>
      <div className={styles.testSiteButtons}>
        <button
          type="button"
          className={`${styles.button} ${styles.testSiteWide}`}
          data-testid="report-bug"
          disabled={!reportReady}
          onClick={onReportBug}
        >
          Report bug
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="good-bot"
          disabled={!badBotReady}
          title={
            badBotReady
              ? "Tell us what the bot's last move got right"
              : "Live once the bot has made a move"
          }
          onClick={onGoodBot}
        >
          Good Bot!
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="bad-bot"
          disabled={!badBotReady}
          title={
            badBotReady
              ? "Tell us what the bot's last move got wrong"
              : "Live once the bot has made a move"
          }
          onClick={onBadBot}
        >
          Bad Bot!
        </button>
      </div>
      {note && (
        <div className={styles.muted} data-testid="test-site-note">
          {note}
        </div>
      )}
      {/* Open and closed are saved on the click itself: a `toggle` event comes a task later. */}
      <details className={styles.testSettings} open={settings.testSettingsOpen}>
        <summary
          data-testid="test-settings"
          onClick={(e) => {
            e.preventDefault();
            updateSettings({ testSettingsOpen: !settings.testSettingsOpen });
          }}
        >
          Test settings
        </summary>
        <div className={styles.testSettingsBody}>
          <label>
            <input
              type="checkbox"
              data-testid="setting-share-games"
              checked={settings.shareGames}
              onChange={(e) => updateSettings({ shareGames: e.target.checked })}
            />{" "}
            Share finished games to improve GojiSim
          </label>
          <div className={styles.muted}>
            Sends the game record, including both decks, to the GojiSim server.
          </div>
          {canShowHand && (
            <label>
              <input
                type="checkbox"
                data-testid="show-opponent-hand"
                checked={showHand}
                onChange={(e) => onShowHand(e.target.checked)}
              />{" "}
              Show opponent&apos;s hand{" "}
              <span className={styles.muted}>(practice: no statistics)</span>
            </label>
          )}
          <details
            className={styles.whichButton}
            open={settings.whichButtonOpen}
          >
            <summary
              data-testid="which-button"
              onClick={(e) => {
                e.preventDefault();
                updateSettings({ whichButtonOpen: !settings.whichButtonOpen });
              }}
            >
              Which button?
            </summary>
            <p data-testid="which-button-report-bug">
              <strong>Report bug:</strong> something in the game itself is
              wrong: a rule, a card doing the wrong thing, or the screen. Your
              note and the game are sent to us.
            </p>
            <p data-testid="which-button-good-bot">
              <strong>Good Bot!:</strong> the bot made a good play. Tell us what
              it did right, so later changes don&apos;t break it.
            </p>
            <p data-testid="which-button-bad-bot">
              <strong>Bad Bot!</strong> The bot made a bad move. Tell us what it
              did wrong and what you&apos;d have done. Your note and the game
              are sent to us so the bot can learn from it.
            </p>
          </details>
        </div>
      </details>
    </section>
  );
}
