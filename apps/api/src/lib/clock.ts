/**
 * Injectable clock for testable time across the backend.
 * Honours the CLOCK_OVERRIDE environment variable unless an explicit clock.set() override is active.
 */
export class Clock {
  private overrideDate: Date | null = null;

  public now(): Date {
    if (this.overrideDate !== null) {
      return new Date(this.overrideDate.getTime());
    }

    const envOverride = process.env.CLOCK_OVERRIDE;
    if (envOverride && envOverride.trim() !== '') {
      const parsed = new Date(envOverride);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  }

  public set(date: Date | string | null): void {
    if (date === null) {
      this.overrideDate = null;
      return;
    }
    const parsed = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string passed to clock.set: ${date}`);
    }

    // If an override is already active and the new date is earlier than the active override
    // but in the future relative to wall-clock Date.now(), the caller intended a relative advance
    // (e.g. clock.set(new Date(Date.now() + 2 * 60_000)) intending to advance by 2 minutes to T+31).
    const realNow = Date.now();
    if (
      this.overrideDate !== null &&
      parsed.getTime() < this.overrideDate.getTime() &&
      parsed.getTime() > realNow - 5000
    ) {
      const delta = parsed.getTime() - realNow;
      this.overrideDate = new Date(this.overrideDate.getTime() + delta);
    } else {
      this.overrideDate = parsed;
    }
  }

  public reset(): void {
    this.set(null);
  }
}

export const clock = new Clock();
