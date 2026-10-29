import type { Card } from "@gojisim/cards";
import type { LogEntry } from "@gojisim/engine";
import type { AnimationSpeed } from "../play/settings";
import table from "./sounds.json";

/**
 * Sound effects: which sound each game event plays (`sounds.json`: kind → file, volume and
 * cooldown, so sounds can be swapped without code), when it plays within a step, and a small Web
 * Audio player. Sounds play for both players' actions, from the same steps as the card animations
 * (decision 257), so sound and motion line up; with Animation speed Off they play at the step.
 */

export type SoundKind = keyof typeof table;

export interface SoundDef {
  file: string;
  /** 0 to 1, times the Volume setting. */
  volume: number;
  /** The same sound plays at most once per this many ms. */
  cooldownMs: number;
}

export const SOUNDS: Readonly<Record<SoundKind, SoundDef>> = table;

/** One sound to play, `at` ms after the step's moves start. */
export interface Cue {
  kind: SoundKind;
  at: number;
}

/** A card landing plays its thud as it lands, after the move (450 ms at Normal, 220 at Fast). */
const LANDS: readonly SoundKind[] = ["card", "monster", "evolve", "strategy"];
/** Repeats of one kind in a step are spread out, so the throttle lets a few through. */
const SPACING: Partial<Record<SoundKind, number>> = { stomp: 180, destroy: 50 };
/** The roar after the slam's crash. */
export const ROAR_AFTER_MS = 350;

function moveMs(speed: AnimationSpeed): number {
  return speed === "off" ? 0 : speed === "fast" ? 220 : 450;
}

/**
 * The sounds of one step's log entries, in order. `cards` is the view's catalog (a placed card's
 * type). An invasion win's crash and roar are cued here only with Animation speed Off; otherwise
 * the slam plays them at its hit (`slamCues`).
 */
export function stepSounds(
  entries: readonly LogEntry[],
  cards: Readonly<Record<number, Pick<Card, "type"> | undefined>>,
  speed: AnimationSpeed,
): Cue[] {
  const cues: Cue[] = [];
  const counts = new Map<SoundKind, number>();
  const cue = (kind: SoundKind) => {
    const n = counts.get(kind) ?? 0;
    counts.set(kind, n + 1);
    cues.push({
      kind,
      at: (LANDS.includes(kind) ? moveMs(speed) : 0) + n * (SPACING[kind] ?? 0),
    });
  };
  for (const e of entries) {
    const p = e.payload;
    switch (e.type) {
      case "place": {
        // The card an Evolution plays comes with its own `evolve` entry (12.6.2).
        if (p["rule"] === "12.6.2") break;
        const to = String(p["to"] ?? "");
        if (to === "invadingMonsterZone") cue("monster");
        else if (to.startsWith("strategy zone")) cue("strategy");
        else if (to.startsWith("zone")) {
          const type = cards[Number(p["cardId"])]?.type;
          cue(type === "Monster" ? "monster" : "card");
        }
        break;
      }
      case "newInvadingMonster":
        cue("monster");
        break;
      case "evolve":
        cue("evolve");
        break;
      case "destroy":
        cue("destroy");
        break;
      case "advance":
        // One stomp per zone the invasion advances (8.6); end-phase advances are quiet.
        if (p["invasion"] === true) cue("stomp");
        break;
      case "counter":
        cue("counter");
        break;
      case "rageChanged":
        if (Number(p["to"]) > Number(p["from"])) cue("rage");
        break;
      case "draw":
        if (Number(p["count"]) > 0) cue("draw");
        break;
      case "shuffleDeck":
      case "reshuffle":
        cue("shuffle");
        break;
      case "gameOver":
        if (p["reason"] === "invasion" && speed === "off")
          cues.push(...slamCues(0));
        break;
    }
  }
  return cues;
}

/** The slam's crash at its hit, then the roar. */
export function slamCues(at: number): Cue[] {
  return [
    { kind: "slamCrash", at },
    { kind: "roar", at: at + ROAR_AFTER_MS },
  ];
}

/** Whether a new action's sounds play: a live game's new step, never history or a loaded record. */
export function stepIsHeard(step: {
  /** The action count grew (an undo shrinks it). */
  grew: boolean;
  /** The board shows the newest state, not the history view. */
  live: boolean;
  /** The new action's index, and the first index this page played (a loaded record's are history). */
  index: number;
  from: number;
}): boolean {
  return step.grew && step.live && step.index >= step.from;
}

/** The same sound at most once per its cooldown (80 ms): a step with 5 destroys plays a few. */
export class Throttle {
  private last = new Map<SoundKind, number>();
  allow(kind: SoundKind, now: number): boolean {
    const before = this.last.get(kind);
    if (before !== undefined && now - before < SOUNDS[kind].cooldownMs)
      return false;
    this.last.set(kind, now);
    return true;
  }
}

/**
 * Plays the sounds through Web Audio: each file is loaded once into a buffer, and one gain node
 * sets the volume. Browsers block audio until the first user gesture, so nothing plays before
 * `unlock()` (the first click). A missing or failed file is skipped silently.
 */
export class SoundPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<SoundKind, AudioBuffer>();
  private throttle = new Throttle();
  private volume = 0.5;
  private on = true;

  constructor(private readonly base = "/sounds/") {}

  /** The first user gesture: the context starts and the files load. */
  unlock(): void {
    if (this.context) return;
    const Context = globalThis.AudioContext;
    if (!Context) return;
    try {
      this.context = new Context();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
      void this.context.resume?.();
    } catch {
      this.context = null;
      return;
    }
    for (const kind of Object.keys(SOUNDS) as SoundKind[]) void this.load(kind);
  }

  get unlocked(): boolean {
    return this.context !== null;
  }

  private async load(kind: SoundKind): Promise<void> {
    const context = this.context;
    if (!context) return;
    try {
      const response = await fetch(this.base + SOUNDS[kind].file);
      if (!response.ok) return;
      const data = await response.arrayBuffer();
      this.buffers.set(kind, await context.decodeAudioData(data));
    } catch {
      // Skipped: that sound stays silent.
    }
  }

  /** Volume 0 to 1; Sound off silences everything. */
  set(volume: number, on: boolean): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.on = on;
    if (this.gain) this.gain.gain.value = this.volume;
  }

  /** Plays `kind` after `delayMs`, unless Sound is off, it's still locked or the throttle says no. */
  play(kind: SoundKind, delayMs = 0): void {
    if (delayMs > 0) {
      setTimeout(() => this.play(kind), delayMs);
      return;
    }
    const context = this.context;
    const gain = this.gain;
    if (!this.on || !context || !gain) return;
    if (!this.throttle.allow(kind, performance.now())) return;
    const buffer = this.buffers.get(kind);
    if (!buffer) return;
    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      const level = context.createGain();
      level.gain.value = SOUNDS[kind].volume;
      source.connect(level);
      level.connect(gain);
      source.start();
    } catch {
      // A failed play is skipped.
    }
  }

  playCues(cues: readonly Cue[]): void {
    for (const c of cues) this.play(c.kind, c.at);
  }
}
