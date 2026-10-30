// Which source the native hub connects to, as a pure function. ios/InputSelection.swift mirrors this file: change
// both together.
//
// Rules (GATE0 §3.3, A3 brief):
// - An explicit selection wins: the selected id when it is online, else an online source with the selected *name*
//   (a replugged device can come back with a new id; names are the stable key).
// - With nothing selected and auto-select on (setPreferredNames with at least one name), the first online source
//   whose name starts with a preferred name (case-insensitive), trying the names in order; ties go to the
//   alphabetically first name, then the smallest id. Once connected, that source becomes the selection.
// - select(null) turns auto-select off until setPreferredNames is called again, so "none" stays none.
// - A selected source that is offline keeps its selection (nothing connected) and is reconnected when it returns.

export type SelectableSource = { id: string; name: string; online: boolean };

export type SelectionState = {
  selectedId: string | null;
  selectedName: string | null;
  preferredNames: readonly string[];
  autoSelect: boolean;
};

const byNameThenId = (a: SelectableSource, b: SelectableSource) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : Number(a.id) - Number(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The names setPreferredNames keeps: trimmed, non-empty, in order. */
export function cleanPreferredNames(names: readonly string[]): string[] {
  return names.map(n => n.trim()).filter(n => n.length > 0);
}

/** The source to connect now, or null for none. */
export function selectTarget<S extends SelectableSource>(sources: readonly S[], state: SelectionState): S | null {
  const online = sources.filter(s => s.online).sort(byNameThenId);
  if (state.selectedId != null || state.selectedName != null) {
    const byId = state.selectedId != null ? online.find(s => s.id === state.selectedId) : undefined;
    if (byId) return byId;
    if (state.selectedName != null) return online.find(s => s.name === state.selectedName) ?? null;
    return null;
  }
  if (!state.autoSelect) return null;
  for (const pref of state.preferredNames) {
    const p = pref.toLowerCase();
    const hit = online.find(s => s.name.toLowerCase().startsWith(p));
    if (hit) return hit;
  }
  return null;
}
