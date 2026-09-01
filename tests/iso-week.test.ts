import { describe, expect, it } from 'vitest';
import { getIsoWeek } from '@/lib/iso-week';

describe('ISO week', () => {
  it('handles the ISO year boundary', () => {
    expect(getIsoWeek('2021-01-01')).toEqual({ isoYear: 2020, isoWeek: 53 });
  });

  it('calculates a normal week', () => {
    expect(getIsoWeek('2026-08-28')).toEqual({ isoYear: 2026, isoWeek: 35 });
  });
});
