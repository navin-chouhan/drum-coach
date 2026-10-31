// The results sheet of a long take, paged through: the sheet (NotationView `page`) shows one page of the whole take
// with its marks and no cursor, and the pager under it turns the pages (the web's results sheet scrolls through every
// bar; on the iPad the notation is a page at a time, as it is while playing). pagerView is pure.
import { useEffect, useState } from 'react';

export type PagerView = { page: number; pages: number; show: boolean; canPrev: boolean; canNext: boolean; label: string };

export function pagerView(page: number, pages: number): PagerView {
  const n = Math.max(1, Math.floor(pages) || 1);
  const p = Math.max(0, Math.min(n - 1, Math.floor(page) || 0));
  return { page: p, pages: n, show: n > 1, canPrev: p > 0, canNext: p < n - 1, label: `Page ${p + 1} of ${n}` };
}

/** The page shown and the sheet's page count; back to page 1 for each new take (`take` = its identity). */
export function useSheetPages(take: unknown) {
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  useEffect(() => { setPage(0); }, [take]);
  const v = pagerView(page, pages);
  return { ...v, setPages, prev: () => setPage(v.page - 1), next: () => setPage(v.page + 1) };
}
