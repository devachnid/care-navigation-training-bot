/** How long before the limit the trainee is warned (design section 7: a warning at 9 minutes of 10). */
export const WARN_BEFORE_SECONDS = 60;

export type CallClock = {
  /** Seconds left, never below 0. */
  remainingSeconds: number;
  /** One minute or less is left and the call has not yet reached the limit. */
  warn: boolean;
  /** The call has reached the limit and must be hung up. */
  expired: boolean;
};

/** Where a call stands against the maximum call length. Pure: the hook feeds it the elapsed time. */
export function callClock(elapsedSeconds: number, maxSeconds: number): CallClock {
  const remainingSeconds = Math.max(0, Math.ceil(maxSeconds - elapsedSeconds));
  const expired = elapsedSeconds >= maxSeconds;
  return { remainingSeconds, expired, warn: !expired && maxSeconds - elapsedSeconds <= WARN_BEFORE_SECONDS };
}

/** `9:05` for 545 seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "10 minutes", "1 minute", "3 minutes 30 seconds": for sentences. */
export function describeLimit(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  const minutes = `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`;
  return rest === 0 ? minutes : `${minutes} ${rest} ${rest === 1 ? 'second' : 'seconds'}`;
}
