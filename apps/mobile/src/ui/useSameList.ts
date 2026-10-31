import { useState } from 'react';

/** The same array while its items are the same (a list rebuilt every render, kept stable for memo and effect deps). */
export function useSameList<T>(list: readonly T[]): readonly T[] {
  const [kept, setKept] = useState(list);
  if (kept === list || (kept.length === list.length && kept.every((x, i) => x === list[i]))) return kept;
  setKept(list); // React's "adjust state while rendering": this render already uses the new list
  return list;
}
