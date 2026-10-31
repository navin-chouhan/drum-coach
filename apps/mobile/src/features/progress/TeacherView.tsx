// "For your teacher" (the web's TeacherView): the one-page summary, shared as text (the share sheet has Copy, Mail,
// AirDrop and Print from Notes), and the teacher's notes, saved where the coach context reads them.
import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { getStorage } from '../../platform/storage';
import { Body, Button, Card, CardTitle, Strong, color, stroke, tabular, useAppSettings } from '../../ui';
import { NOTE_PLACEHOLDER, TEACHER_INTRO, TEACHER_NOTES_KEY, addTeacherNote, readTeacherNotes, teacherSheet, teacherText, type TeacherNote } from './teacher';

export function TeacherView({ runs, lessons }: { runs: RunRow[]; lessons: Lesson[] }) {
  const s = useAppSettings();
  const sheet = useMemo(() => teacherSheet({ runs, progress: s.lessons, profile: s.profile, leftHanded: s.leftHanded, lessons }), [runs, s.lessons, s.profile, s.leftHanded, lessons]);
  const [notes, setNotes] = useState<TeacherNote[]>(() => readTeacherNotes(getStorage().settings?.get(TEACHER_NOTES_KEY)));
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const add = () => {
    const next = addTeacherNote(notes, draft);
    if (next === notes) return;
    try { getStorage().settings?.put(TEACHER_NOTES_KEY, next); setNotes(next); setDraft(''); setMessage(''); }
    catch { setMessage('The note could not be saved.'); }
  };
  const share = () => {
    Share.share({ title: sheet.title, message: teacherText(sheet, notes) }).catch(() => setMessage('Sharing failed.'));
  };

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.cols}>
      <View style={styles.col}>
        <Card style={styles.card} testID="progress-teacher">
          <CardTitle>👩‍🏫 For your teacher</CardTitle>
          <Body>{TEACHER_INTRO}</Body>
          <Button tone="blue" label="Share this page" emoji="📤" onPress={share} testID="teacher-share" />
        </Card>
        <Card style={styles.card} testID="teacher-sheet">
          <CardTitle size={18}>{sheet.title}</CardTitle>
          {sheet.rows.map(([k, v]) => <Body key={k}><Strong>{`${k}: `}</Strong>{v}</Body>)}
          {sheet.perDrum.map(d => (
            <View key={d.drum} style={styles.tr}>
              {[d.drum, d.landed, d.offset, d.trend].map((x, i) => <Body key={i} size={14} style={[styles.td, tabular]}>{x}</Body>)}
            </View>
          ))}
          <Body size={13} color={color.muted}>{sheet.questions}</Body>
        </Card>
      </View>
      <View style={styles.col}>
        <Card style={styles.card} testID="teacher-notes">
          <CardTitle size={18}>The teacher&apos;s notes</CardTitle>
          <TextInput value={draft} onChangeText={setDraft} placeholder={NOTE_PLACEHOLDER} placeholderTextColor={color.muted} multiline maxLength={1000}
            style={styles.input} accessibilityLabel="The teacher's note" testID="teacher-note-input" />
          <Button tone="blue" label="Save note" onPress={add} disabled={!draft.trim()} testID="teacher-note-save" />
          {message ? <Body color={color.bad}>{message}</Body> : null}
          {notes.length ? [...notes].reverse().map((n, i) => <Body key={`${n.date}-${i}`}><Strong>{n.date}</Strong>{`: ${n.text}`}</Body>)
            : <Body size={13} color={color.muted}>No notes yet.</Body>}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cols: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  col: { flex: 1, gap: 18, minWidth: 0 },
  card: { gap: 10 },
  tr: { flexDirection: 'row', gap: 12 },
  td: { flex: 1 },
  input: { minHeight: 110, borderWidth: stroke.thin, borderColor: color.ink, borderRadius: 8, backgroundColor: color.cream, padding: 12, fontSize: 16, color: color.ink, textAlignVertical: 'top' },
});
