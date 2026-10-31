import { describe, expect, it } from 'vitest';
import { color, drumColor, resultColor, resultOnNight } from '../ui/tokens';
import { IPAD_THEME, THEMES, WEB_THEME } from './theme';

describe('play themes', () => {
  it('the iPad theme takes its drum and result colours from the UI tokens (one source)', () => {
    expect(IPAD_THEME.drum).toEqual(drumColor);
    expect(IPAD_THEME.result).toEqual(resultOnNight);
    expect(IPAD_THEME.sheetResult).toEqual(resultColor);
    expect(IPAD_THEME.background).toBe(color.night);
    expect(IPAD_THEME.nowLine).toBe(color.pop);
  });

  it('keeps the web theme as the alternative', () => {
    expect(THEMES).toEqual({ ipad: IPAD_THEME, web: WEB_THEME });
    expect(WEB_THEME.drum.kick).toBe('#E8423F');
    expect(WEB_THEME.drum).not.toEqual(IPAD_THEME.drum);
  });
});
