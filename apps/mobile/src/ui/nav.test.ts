import { describe, expect, it } from 'vitest';
import { appKeyFor } from '../platform/keyboardCore';
import { NAV, parseSidebarPref, sectionOf, sidebarModeFor, toggledPref } from './nav';
import { kitDot } from './status';

describe('the D10 shell: four sections, the collapsible sidebar, the kit dot', () => {
  it('four sections; Songs lights Practice, Progress and Coach light You, Build info lights Setup', () => {
    expect(NAV.map(n => n.label)).toEqual(['Journey', 'Practice', 'You', 'Setup']);
    expect(NAV.map(n => n.testID)).toEqual(['nav-journey', 'nav-practice', 'nav-you', 'nav-setup']);
    expect([sectionOf('songs'), sectionOf('progress'), sectionOf('coach'), sectionOf('about'), sectionOf('practice'), sectionOf('you'), sectionOf('nope')])
      .toEqual(['practice', 'you', 'you', 'setup', 'practice', 'you', 'index']);
  });

  it('expanded on Journey and a rail elsewhere until « / » picks one, which then holds everywhere', () => {
    expect(sidebarModeFor('auto', 'index')).toBe('expanded');
    expect(sidebarModeFor('auto', 'practice')).toBe('rail');
    expect(sidebarModeFor('rail', 'index')).toBe('rail');
    expect(sidebarModeFor('expanded', 'setup')).toBe('expanded');
    expect(toggledPref('expanded')).toBe('rail');
    expect(toggledPref('rail')).toBe('expanded');
    expect([parseSidebarPref(null), parseSidebarPref('rail'), parseSidebarPref('expanded'), parseSidebarPref('junk')]).toEqual(['auto', 'rail', 'expanded', 'auto']);
  });

  it('the backslash key is a command (never a pad)', () => {
    expect(appKeyFor({ key: '\\', down: true, shift: false, alt: false, timeMs: 0 })).toBe('\\');
  });

  it('one kit dot: green with its name, orange when not plugged in, grey for touch pads', () => {
    expect(kitDot({ midi: true, kit: 'e-Drum' })).toMatchObject({ dot: 'on', name: 'e-Drum', value: 'ready' });
    expect(kitDot({ midi: true, kit: null })).toMatchObject({ dot: 'warn', value: 'not plugged in' });
    expect(kitDot({ midi: false, kit: null })).toMatchObject({ dot: 'off', value: 'touch pads' });
  });
});
