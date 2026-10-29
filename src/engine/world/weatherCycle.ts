import { nextRandomWeather, weatherSpan, type Weather } from './atmosphere';

/**
 * Random weather as spells (atmosphere.ts WEATHER_SPAN): each weather holds for its spell, in the bank's minutes (a fair
 * spell an hour or more, a shower a quarter of an hour, a storm ten minutes or so), then the next comes in, never the same
 * twice running. A new day, or the clock wound back, starts a new spell. On the bank's clock, so the weather holds while the
 * bank is paused. Pure: the dice come in as `roll`, so a test can play a day of weather.
 */
export class WeatherCycle {
  private spell: { from: number; until: number } | null = null;

  constructor(private readonly roll: () => number = Math.random) {}

  /** The weather to change to at `minute`, given the weather now; null to keep it (inside the spell, or random mode off). */
  update(minute: number, now: Weather, random: boolean): Weather | null {
    if (!random) {
      this.spell = null;
      return null;
    }
    const s = this.spell;
    if (s && minute >= s.from && minute < s.until) return null;
    const next = nextRandomWeather(now, this.roll());
    this.spell = { from: minute, until: minute + weatherSpan(next, this.roll()) };
    return next;
  }

  /** The spell now, [from, until) in the bank's minutes, or null. */
  get current(): { from: number; until: number } | null {
    return this.spell;
  }
}
