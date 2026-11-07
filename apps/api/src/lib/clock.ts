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
    } else if (date instanceof Date) {
      this.overrideDate = new Date(date.getTime());
    } else {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid date string passed to clock.set: ${date}`);
      }
      this.overrideDate = parsed;
    }
  }

  public reset(): void {
    this.set(null);
  }
}

export const clock = new Clock();
