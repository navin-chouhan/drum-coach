// The latest value of a prop or a callback, for listeners and effects that outlive a render (the hit bus, the
// keyboard, timers): a ref written after each commit, never during render (React's rules: react-hooks/refs).
// React only: the DOM components ('use dom') import it too.
import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return ref;
}
