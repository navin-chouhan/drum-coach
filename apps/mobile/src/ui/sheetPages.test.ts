import { describe, expect, it } from 'vitest';
import { pagerView } from './sheetPages';

describe('the results sheet pager', () => {
  it('hides for a one-page take', () => {
    expect(pagerView(0, 1)).toMatchObject({ show: false, label: 'Page 1 of 1' });
  });
  it('pages through a long take, clamped to its pages', () => {
    expect(pagerView(0, 3)).toEqual({ page: 0, pages: 3, show: true, canPrev: false, canNext: true, label: 'Page 1 of 3' });
    expect(pagerView(1, 3)).toMatchObject({ canPrev: true, canNext: true, label: 'Page 2 of 3' });
    expect(pagerView(5, 3)).toMatchObject({ page: 2, canNext: false, label: 'Page 3 of 3' });
    expect(pagerView(-1, 3).page).toBe(0);
    expect(pagerView(2, 2)).toMatchObject({ page: 1 }); // a relayout with fewer pages
    expect(pagerView(Number.NaN, 0)).toMatchObject({ page: 0, pages: 1 });
  });
});
