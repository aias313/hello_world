/**
 * Runtime primitives: a pluggable clock and id generator.
 *
 * Everything time- or id-dependent flows through here so that tests can inject
 * a deterministic clock/counter and get reproducible output, while production
 * uses the real wall clock and a random suffix.
 */

export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
  /** Current time as an ISO-8601 string. */
  isoNow(): string;
}

export interface IdGen {
  /** Generate a namespaced identifier, e.g. `mb_a1b2c3`. */
  next(prefix: string): string;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  isoNow(): string {
    return new Date().toISOString();
  }
}

/** A clock frozen at (and advanceable from) a fixed instant — used in tests. */
export class FixedClock implements Clock {
  private ms: number;
  constructor(start: string | number = "2026-01-01T00:00:00.000Z") {
    this.ms = typeof start === "string" ? Date.parse(start) : start;
  }
  now(): number {
    return this.ms;
  }
  isoNow(): string {
    return new Date(this.ms).toISOString();
  }
  /** Advance the clock by a number of milliseconds. */
  advance(ms: number): void {
    this.ms += ms;
  }
  set(time: string | number): void {
    this.ms = typeof time === "string" ? Date.parse(time) : time;
  }
}

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export class RandomIdGen implements IdGen {
  next(prefix: string): string {
    let s = "";
    for (let i = 0; i < 8; i++) {
      s += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    return `${prefix}_${s}`;
  }
}

/** Monotonic, deterministic id generator for tests. */
export class SeqIdGen implements IdGen {
  private counters = new Map<string, number>();
  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(6, "0")}`;
  }
}

export interface Runtime {
  clock: Clock;
  ids: IdGen;
}

export function systemRuntime(): Runtime {
  return { clock: new SystemClock(), ids: new RandomIdGen() };
}

export function deterministicRuntime(start?: string): Runtime {
  return { clock: new FixedClock(start), ids: new SeqIdGen() };
}
