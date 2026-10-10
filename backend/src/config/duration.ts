const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Ubah durasi seperti "15m", "7d", "3600" (detik) menjadi detik. */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) throw new Error(`Format durasi tidak valid: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2];
  if (!unit) return amount;
  return Math.floor((amount * UNIT_MS[unit]) / 1000);
}
