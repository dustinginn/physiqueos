// Evaluated before any read code (first import of the benchmark entry). With a fixed instant, every
// argument-less `new Date()` / `Date.now()` returns it, so two runs of different code against the same
// production snapshot produce comparable responses (parity hashes). Null leaves the real clock alone.
const FIXED_NOW = __FIXED_NOW__;

if (FIXED_NOW) {
  const fixed = Date.parse(FIXED_NOW);
  if (Number.isNaN(fixed)) throw new Error("FIXED_NOW_INVALID");
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }

    static now() { return fixed; }

    // Dates made by the real constructor (before the patch or by native code) stay `instanceof Date`.
    static [Symbol.hasInstance](value) { return value instanceof RealDate; }
  }
  globalThis.Date = FixedDate;
}

export const fixedNow = FIXED_NOW;
