// The note map (web: Setup → Advanced → note map): the note each pad sends, editable here, with the duplicate check
// and the module fix, and Reset to MPS-150 defaults. "Hit each pad once" fills it in.
import { DEFAULT_NOTE_MAP, type NoteMap } from '@drum-coach/core/engine/kit';
import { StyleSheet, View } from 'react-native';
import { getStorage } from '../../platform/storage';
import { Body, Button, Card, Group, GroupRow, Stepper, color } from '../../ui';
import { lastHitView } from '../setup/kit';
import { useLastHit } from '../setup/useSetup';
import { conflictText, noteRows, withNote, writeNoteMap } from './kitStore';

export function NoteMapPanel({ kit, map }: { kit: string; map: NoteMap }) {
  const last = useLastHit();
  const rows = noteRows(map);
  const warn = conflictText(map);
  const set = (next: NoteMap | null) => { if (next) writeNoteMap(getStorage().kv, kit, next); };
  const half = Math.ceil(rows.length / 2);
  const col = (rs: typeof rows) => (
    <Group style={styles.col}>
      {rs.map((r, i) => (
        <GroupRow key={r.pad} first={i === 0} title={r.name} sub={r.conflict ? 'shares a note' : r.isDefault ? 'default' : `default ${DEFAULT_NOTE_MAP[r.pad]}`}
          right={<Stepper label={`${r.name} note`} value={r.note} min={0} max={127} onChange={n => set(withNote(map, r.pad, n))} testID={`notemap-${r.pad}`} />} />
      ))}
    </Group>
  );
  return (
    <View style={styles.wrap} testID="notemap">
      <Body size={15} weight="700">
        The note each pad sends. "Hit each pad once" fills this in; change a number only if you changed it on the module (VOICE → PAGE to Nxx).
        {' '}Last note received: {last ? `${last.note} (${lastHitView(last).sub})` : '—'}
      </Body>
      <View style={styles.cols}>{col(rows.slice(0, half))}{col(rows.slice(half))}</View>
      {warn ? <Card tone="pop" testID="notemap-conflict"><Body size={15} weight="700" color={color.ink}>⚠️ {warn}</Body></Card> : null}
      <Button label="Reset to MPS-150 defaults" onPress={() => set({ ...DEFAULT_NOTE_MAP })} testID="notemap-reset" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 16 },
  cols: { flexDirection: 'row', gap: 22, alignItems: 'flex-start' },
  col: { flex: 1 },
});
