// Setup → Coach and voice (web CoachSettings): voice, how much the coach says, and Claude and your plan (the coach
// follows my practice, writes the tips, goals, minutes a day). The words and patches are in coachVoice.ts.
import { StyleSheet, View } from 'react-native';
import { getStorage } from '../../platform/storage';
import { Body, Button, Group, GroupRow, Segmented, Toggle, useAppSettings, writeSettings } from '../../ui';
import { sayNow, setVoiceVolume } from '../coach/voice';
import { COACH_GOALS, COACH_MINUTES, COACH_VOICE_LINES as L, VOICE_TEST_LINE, minutesPatch, toggleGoalPatch } from './coachVoice';
import { CHATTINESS } from './whilePlaying';
import type { Settings } from '@drum-coach/core/input/settings';

const save = (p: Partial<Settings>) => writeSettings(getStorage().kv, p);

export function CoachVoicePanel() {
  const s = useAppSettings();
  const sw = (key: 'voice' | 'countIn' | 'liveCoach' | 'aiTips', first = false) => (
    <GroupRow first={first} title={L[key].title} sub={L[key].sub}
      right={<Toggle label={L[key].title} value={!!s[key]} onChange={v => save({ [key]: v })} testID={`coachvoice-${key}`} />} />
  );
  return (
    <View style={styles.cols} testID="coachvoice">
      <View style={styles.col}>
        <Group title="Voice">
          {sw('voice', true)}
          {sw('countIn')}
          <GroupRow title="Test the voice" sub={`${L.voiceVolume.title}: Setup → Sound levels.`}
            right={<Button size="small" label="Test the voice" emoji="▶" onPress={() => { setVoiceVolume(s.voiceVolume); sayNow(VOICE_TEST_LINE); }} testID="coachvoice-test" />} />
        </Group>
        <Group title="While you play">
          <GroupRow first title={L.chattiness.title} sub={L.chattiness.sub}
            right={<Segmented accessibilityLabel={L.chattiness.title} value={s.chattiness} onChange={chattiness => save({ chattiness })}
              options={CHATTINESS.map(([value, label]) => ({ value, label }))} testID="coachvoice-chattiness" />} />
        </Group>
      </View>
      <View style={styles.col}>
        <Group title="Claude and your plan">
          {sw('liveCoach', true)}
          {sw('aiTips')}
          <GroupRow>
            <View style={styles.grow}>
              <Body weight="700">{L.goals.title}</Body>
              <Body size={13}>{L.goals.sub}</Body>
              <View style={styles.chips} accessibilityLabel={L.goals.title}>
                {COACH_GOALS.map(g => {
                  const on = s.profile.goals.includes(g.id);
                  return <Button key={g.id} size="small" label={g.label} tone={on ? 'pop' : 'white'} accessibilityLabel={`${L.goals.title}: ${g.label}${on ? ', selected' : ''}`}
                    onPress={() => save(toggleGoalPatch(s.profile, g.id))} testID={`coachvoice-goal-${g.id}`} />;
                })}
              </View>
            </View>
          </GroupRow>
          <GroupRow>
            <View style={styles.grow}>
              <Body weight="700">{L.minutes.title}</Body>
              <Body size={13}>{L.minutes.sub}</Body>
              <View style={styles.chips}>
                <Segmented accessibilityLabel={L.minutes.title} value={String(s.profile.minutesPerDay)} onChange={v => save(minutesPatch(s.profile, Number(v)))}
                  options={COACH_MINUTES.map(m => ({ value: String(m), label: String(m) }))} testID="coachvoice-minutes" />
              </View>
            </View>
          </GroupRow>
        </Group>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cols: { flex: 1, flexDirection: 'row', gap: 22, alignItems: 'flex-start' },
  col: { flex: 1, gap: 14, minWidth: 0 },
  grow: { flex: 1, minWidth: 0, gap: 4, paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
