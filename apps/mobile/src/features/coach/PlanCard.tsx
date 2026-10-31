// The coach's week plan (src/coach/CoachView.tsx PlanCard): goals, minutes a day and days a week, "Make my plan",
// then the plan's days with tick boxes and play links. Kept on the iPad (weekPlan.ts).
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Display, Field, Label, color, slopFor } from '../../ui';
import { drillRoute, getCoach, songRoute, useCoachEntry, useWeekPlan } from './coach';
import { ProblemCard } from './CoachPanel';
import { THINKING } from './panel';
import { cleanPlanForm, DEFAULT_PLAN_FORM, planItemLine, planItemTarget } from './weekPlan';

export function PlanCard() {
  const coach = getCoach();
  const shown = useWeekPlan();
  const [form, setForm] = useState({ goals: DEFAULT_PLAN_FORM.goals, minutesPerDay: String(DEFAULT_PLAN_FORM.minutesPerDay), daysPerWeek: String(DEFAULT_PLAN_FORM.daysPerWeek) });
  const [key, setKey] = useState<string | null>(null);
  const e = useCoachEntry(key);
  const make = () => setKey(coach.weekPlan.make(cleanPlanForm(form)));

  return (
    <Card style={styles.card} testID="coach-plan">
      <Label>Weekly plan</Label>
      <View style={styles.form}>
        <Field label="Goals" value={form.goals} onChange={goals => setForm({ ...form, goals })} maxLength={500} showLabel style={styles.flex} testID="coach-plan-goals" />
        <Field label="Minutes/day" value={form.minutesPerDay} onChange={minutesPerDay => setForm({ ...form, minutesPerDay })} numeric showLabel style={styles.narrow} testID="coach-plan-minutes" />
        <Field label="Days/week" value={form.daysPerWeek} onChange={daysPerWeek => setForm({ ...form, daysPerWeek })} numeric showLabel style={styles.narrow} testID="coach-plan-days" />
      </View>
      {e?.status === 'thinking'
        ? <View style={styles.think}><Display size={15}>The coach is writing your plan…</Display><Body size={13.5}>{THINKING.line}</Body></View>
        : <Button tone="blue" emoji="🗺️" label={shown ? 'Make a new plan' : 'Make my plan'} testID="coach-plan-make" onPress={make} />}
      {e?.status === 'error' ? (e.problem ? <ProblemCard problem={e.problem} onRetry={make} /> : <Body color={color.bad}>{e.error}</Body>) : null}
      {shown ? (
        <ScrollView style={styles.plan} contentContainerStyle={styles.planInner}>
          <Display size={19}>{shown.plan.title}</Display>
          {shown.plan.focus ? <Body>🎯 <Text style={styles.bold}>{shown.plan.focus}</Text>{shown.plan.why ? ` · ${shown.plan.why}` : ''}</Body> : null}
          {shown.plan.days?.map((d, di) => (
            <View key={`${di}-${d.day}`} style={styles.day}>
              <Body weight="900">{d.day}</Body>
              {d.items.map((it, ii) => {
                const k = `${di}.${ii}`, done = !!shown.checks[k];
                const target = planItemTarget(it, coach.exists);
                const play = target ? () => router.push((target.kind === 'song' ? songRoute(target.id) : drillRoute(target))) : undefined;
                return (
                  <View key={k} style={styles.item}>
                    <Pressable onPress={() => coach.weekPlan.toggle(k)} hitSlop={slopFor(26)} testID={`coach-plan-item-${k}`}
                      accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={planItemLine(it)}
                      style={[styles.box, done && styles.boxOn]}>
                      {done ? <Text style={styles.tick}>✓</Text> : null}
                    </Pressable>
                    <View style={styles.itemText}>
                      <Body style={done ? styles.done : undefined}>{planItemLine(it)}</Body>
                      {it.notes ? <Body size={13} color={color.muted}>{it.notes}</Body> : null}
                    </View>
                    {play ? <Button size="small" tone="plain" emoji="▶" label="play" accessibilityLabel={`Play ${it.title}`} onPress={play} /> : null}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 10, minHeight: 0 },
  form: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  flex: { flex: 1 },
  narrow: { width: 110 },
  think: { backgroundColor: color.cream, borderWidth: 3, borderStyle: 'dashed', borderColor: color.ink, padding: 10 },
  plan: { flex: 1, minHeight: 0 },
  planInner: { gap: 8, paddingBottom: 8 },
  bold: { fontWeight: '900' },
  day: { gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  itemText: { flex: 1 },
  box: { width: 26, height: 26, borderWidth: 3, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.good },
  tick: { color: color.white, fontWeight: '900', fontSize: 14 },
  done: { textDecorationLine: 'line-through', color: color.muted },
});
