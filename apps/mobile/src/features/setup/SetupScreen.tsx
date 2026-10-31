// Setup (D10 reorganisation, docs/mobile/reorg/setup-after.png): one job, is everything working. Three status cards
// (Kit, Latency, Coach, each with its one fix) and six rows that open their pages full screen: Pads (hit each pad, soft
// then loud, note map, MIDI input), Sound, Coach's voice, While you play (kit gestures, autopilot, which hand leads),
// Coach connection (home server, API key, Claude and your plan) and About (build, debug screens). Kit test is in the
// title bar. `/setup?tool=<page or tool>` opens one. Kit gestures: the "yes" gesture starts what to do first.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getHomeServer, validateServerConfig } from '../../platform/api';
import { audio } from '../../platform/audio';
import { useAudioEngine } from '../../platform/useAudio';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { KitView, type PadHit, type Subscribe } from '../../play';
import { TOUCH_KIT } from '../../play/kitLayout';
import { withoutKitSound } from '../../play/kitSounds';
import {
  Body, Button, Card, Chevron, GestureChip, Group, GroupRow, Label, Pill, Screen, Segmented, TitleBar, Toggle, ToolFrame, color, font, getAppHitBus, hardShadow, padColor, stroke,
  useAppSettings, useKitMoves, useStatusRows, writeSettings,
} from '../../ui';
import { LatencyPanel } from '../latency/LatencyPanel';
import { latencyRow, otherRoutes, readLatencyByRoute, shortDate } from '../latency/latencyByRoute';
import { hostOf } from '../coach/problem';
import { NoteMapPanel } from '../pads/NoteMapPanel';
import { PadWizardView } from '../pads/PadWizardView';
import { VelocityPanel } from '../pads/VelocityPanel';
import { conflictText, noteMapSummary } from '../pads/kitStore';
import { setupChecks } from './checklist';
import {
  API_KEY_FOOT, COACH_MODEL_KEY, DEFAULT_FALLBACK_MODEL, SERVER_FOOT, SERVER_PLACEHOLDER, apiKeyValue, cleanCoachModel, hasApiKey, removeApiKey, saveApiKey, saveServer, testConnection, tokenMask, type TestResult,
} from './coachServer';
import { KEYS_LINE, KIT_FOOT, inputChoices, kitStatus, lastHitView } from './kit';
import { CoachPlanGroup, VoicePanel } from './CoachVoicePanel';
import { PARENT, VIEW_TITLE, coachCard, lastHitLine, rowLines, setupViewOf, type SetupPage, type SetupView } from './setupHome';
import { SoundPanel } from './SoundPanel';
import { TimelineView } from './TimelineView';
import { useAudioRoute, useKitConnection, useKitData, useLastHit, useRecentRuns, keychain } from './useSetup';
import { AUTOPILOT_SUB, GESTURE_LIST, HAND_SUB } from './whilePlaying';
import type { Settings } from '@drum-coach/core/input/settings';

const kv = () => getStorage().kv;
const save = (p: Partial<Settings>) => writeSettings(kv(), p);

/** The web's gesture list (CoachSettings "Sticks in hand"), shown on While you play. */
const GESTURE_CHIPS = [{ pad: 'hhPedal', times: 3 }, { pad: 'ride', times: 2 }, { pad: 'tom2', times: 2 }, { pad: 'floor', times: 2 }, { pad: 'tom1', times: 2 }, { pad: 'crash', times: 4 }] as const; // = GESTURE_LIST's order

export function SetupScreen() {
  const s = useAppSettings();
  const conn = useKitConnection();
  const { kit, map, padCal } = useKitData();
  const route = useAudioRoute();
  const runs = useRecentRuns();
  const statusRows = useStatusRows();
  const params = useLocalSearchParams<{ tool?: string }>();
  const [view, setView] = useState<SetupView | null>(() => setupViewOf(params.tool));
  const [askedTool, setAskedTool] = useState(params.tool);
  if (askedTool !== params.tool) { setAskedTool(params.tool); const t = setupViewOf(params.tool); if (t) setView(t); }
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => { let live = true; void hasApiKey(keychain).then(v => { if (live) setHasKey(v); }, () => {}); return () => { live = false; }; }, [view]);
  const status = kitStatus(conn.midi, conn.connected);
  const checks = setupChecks({ settings: s, padCal, runs, device: conn.connected?.name ?? null });
  const latency = checks.find(c => c.id === 'latency')!;
  const pads = checks.find(c => c.id === 'pads')!;
  // QA2 m7: the per-route latencies are re-read only when settings change (every save writes settings too), and the
  // last hit re-renders only its own view, never the whole screen.
  const byRoute = useMemo(() => readLatencyByRoute(kv()), [s]); // eslint-disable-line react-hooks/exhaustive-deps -- s: re-read when settings are saved (see above)
  const lat = latencyRow(byRoute, route, s);
  const others = otherRoutes(byRoute, route?.key ?? null);
  const clash = conflictText(map);
  const server = getHomeServer().configured();
  const coach = coachCard(coachStatusOf(statusRows), hostOf(server?.url), hasKey);
  const lines = rowLines(s, { clash: !!clash, serverSet: !!server, hasKey });
  // Close goes back to the page a tool was opened from (Pads → Note map → Close → Pads), else to Setup.
  const close = () => { setView(v => (v ? PARENT[v] ?? null : null)); if (params.tool) router.setParams({ tool: undefined }); };

  // Hands-free: the "yes" gesture starts the check to do first (latency), else hit each pad.
  useKitMoves({ yes: () => setView(latency.first ? 'latency' : 'pads') }, { enabled: view === null });

  const row = (page: SetupPage, emoji: string, title: string) => (
    <Pressable key={page} onPress={() => setView(page)} accessibilityRole="button" accessibilityLabel={`${title}: ${lines[page]}`} testID={`setup-row-${page}`}
      style={({ pressed }) => [styles.bigRow, pressed && styles.pressed]}>
      <Text style={styles.bigEmoji}>{emoji}</Text>
      <View style={styles.grow}>
        <Text style={styles.bigTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.bigSub} numberOfLines={1}>{lines[page]}</Text>
      </View>
      <Chevron />
    </Pressable>
  );

  return (
    <Screen testID="screen-setup">
      <TitleBar title="Setup" right={<Button label="Kit test" emoji="🥁" tone="pop" size="small" onPress={() => setView('kittest')} testID="setup-kit-test" />} />
      <View style={styles.cards}>
        <Card style={styles.card} testID="setup-kit">
          <Label>Kit</Label>
          <View style={styles.cardTitleRow}>
            <View style={[styles.dot8, { backgroundColor: status.connected ? color.good : color.toggleOff }]} />
            <Text style={styles.cardTitle} numberOfLines={1} testID="setup-kit-name">{status.title}</Text>
          </View>
          {status.connected ? <LastHitLine /> : <Text style={styles.cardSub} numberOfLines={2}>{status.sub}</Text>}
          {!status.connected && conn.inputs.some(i => i.online)
            ? <Button size="small" tone="blue" label="Pick the MIDI input" onPress={() => setView('input')} testID="setup-midi-input" /> : null}
        </Card>
        <Card style={[styles.card, latency.first && styles.cardTodo]} testID="setup-latency">
          <Label>Latency</Label>
          <Text style={styles.cardTitle} numberOfLines={1}>{lat.title}</Text>
          {lat.measured ? <Text style={styles.cardSub} numberOfLines={2}>{others.length ? `${lat.sub} · also ${others.join(', ')}` : lat.sub}</Text> : null}
          <Button size="small" tone={latency.first || !lat.measured ? 'blue' : 'white'} label={lat.measured ? 'Measure again' : 'Measure · 1 min'}
            onPress={() => setView('latency')} testID="setup-latency-measure" />
          {latency.why ? <Text style={styles.cardSub} numberOfLines={2}>{latency.why}</Text> : null}
        </Card>
        <Card style={styles.card} testID="setup-coach">
          <Label>Coach</Label>
          <View style={styles.cardTitleRow}>
            <View style={[styles.dot8, { backgroundColor: coach.dot === 'on' ? color.good : coach.dot === 'bad' ? color.bad : color.toggleOff }]} />
            <Text style={styles.cardTitle} numberOfLines={1}>{coach.title}</Text>
          </View>
          <Text style={styles.cardSub} numberOfLines={2}>{coach.sub}</Text>
          {coach.fix ? <Button size="small" tone="blue" label={coach.fix} onPress={() => setView('connection')} testID="setup-coach-fix" /> : null}
        </Card>
      </View>
      <View style={styles.rows}>
        {row('kitpads', '🎯', 'Pads')}
        {row('sound', '🔊', 'Sound')}
        {row('voice', '🗣', 'Coach’s voice')}
        {row('play', '🎛', 'While you play')}
        {row('connection', '💬', 'Coach connection')}
        {row('about', 'ℹ️', 'About')}
      </View>

      <ToolFrame visible={view !== null} title={view ? VIEW_TITLE[view] : ''} onClose={close} testID={`setup-tool-${view ?? 'none'}`}>
        {view === 'kitpads' ? (
          <View style={styles.cols}>
            <View style={styles.col}>
              <Group title="Kit" foot={KIT_FOOT}>
                <View style={styles.hero}>
                  <View style={[styles.heroSym, { backgroundColor: status.connected ? color.good : color.toggleOff }]}><Text style={styles.heroEmoji}>🥁</Text></View>
                  <View style={styles.grow}>
                    <Text style={styles.heroTitle}>{status.title}</Text>
                    <Text style={styles.heroSub} numberOfLines={2}>{status.sub}</Text>
                  </View>
                  <LastHit />
                </View>
                <GroupRow emoji="🔌" sym="gray" title="MIDI input" right={<><Text style={styles.val}>{conn.connected?.name ?? (conn.inputs.length ? 'none' : 'no inputs')}</Text><Chevron /></>}
                  onPress={() => setView('input')} testID="setup-midi-input-row" accessibilityLabel={`MIDI input: ${conn.connected?.name ?? 'none'}`} />
              </Group>
            </View>
            <View style={styles.col}>
              <Group title="Pads">
                <GroupRow first emoji="🎯" sym="indigo" title="Hit each pad once"
                  sub={clash ? 'two pads share a note: hit each pad again' : s.padsCheckedAt ? `checked ${shortDate(s.padsCheckedAt)}` : pads.done ? 'done in the first run' : 'so a hit on tom 1 counts as tom 1 · 30 s'}
                  right={<Button size="small" tone={pads.done ? 'white' : 'blue'} label={pads.done ? 'Again' : 'Start ▶'} onPress={() => setView('pads')} testID="setup-pads" />} />
                <GroupRow emoji="🎧" sym="teal" title="Soft, then loud" sub="accents and ghost notes judged fairly"
                  right={<>{Object.keys(padCal).length ? <Pill tone="green">✓ done</Pill> : <Text style={styles.val}>2 min</Text>}<Chevron /></>}
                  onPress={() => setView('velocity')} testID="setup-velocity" />
                <GroupRow emoji="🎸" sym="gray" title="Note map" right={<><Text style={styles.val} numberOfLines={1}>{noteMapSummary(map)}</Text><Chevron /></>}
                  onPress={() => setView('notemap')} testID="setup-notemap" />
              </Group>
            </View>
          </View>
        ) : null}
        {view === 'pads' ? <PadWizardView kit={kit} map={map} onSaved={close} onStop={close} /> : null}
        {view === 'velocity' ? <VelocityPanel kit={kit} map={map} padCal={padCal} kitConnected={!!conn.connected} /> : null}
        {view === 'notemap' ? <NoteMapPanel kit={kit} map={map} /> : null}
        {view === 'input' ? <InputPicker conn={conn} onPicked={close} /> : null}
        {view === 'latency' ? <LatencyPanel onSaved={close} /> : null}
        {view === 'sound' ? <SoundPanel /> : null}
        {view === 'kittest' ? <KitTest /> : null}
        {view === 'voice' ? <VoicePanel /> : null}
        {view === 'play' ? (
          <View style={styles.cols}>
            <View style={styles.col}>
              <Group title="While you play" testID="setup-play">
                <GroupRow first right={<Toggle label="Kit gestures" value={s.padCommands !== false} onChange={padCommands => save({ padCommands })} testID="setup-gestures" />}>
                  <View style={styles.grow}>
                    <Text style={styles.rowTitle}>Kit gestures</Text>
                    <Text style={styles.heroSub}>Answer the screen from the kit, between takes.</Text>
                  </View>
                </GroupRow>
                <GroupRow title="Autopilot" sub={AUTOPILOT_SUB} right={<Toggle label="Autopilot" value={!!s.autopilot} onChange={autopilot => save({ autopilot })} testID="setup-autopilot" />} />
                <GroupRow title="Which hand leads" sub={HAND_SUB}
                  right={<Segmented accessibilityLabel="Which hand leads" value={s.leftHanded ? 'left' : 'right'} onChange={v => save({ leftHanded: v === 'left' })}
                    options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]} testID="setup-hand" />} />
              </Group>
            </View>
            <View style={styles.col}>
              <Group title="Kit gestures">
                {GESTURE_CHIPS.map((g, i) => (
                  <GroupRow key={`${g.pad}${g.times}`} first={i === 0} right={<Text style={styles.val}>{GESTURE_LIST[i][1]}</Text>}>
                    <GestureChip gesture={g} />
                  </GroupRow>
                ))}
              </Group>
            </View>
          </View>
        ) : null}
        {view === 'connection' ? (
          <ScrollView contentContainerStyle={styles.cols}>
            <View style={styles.col}>
              <ServerGroup />
              <ApiKeyGroup onOpen={() => setView('apikey')} editing={false} />
            </View>
            <View style={styles.col}><CoachPlanGroup /></View>
          </ScrollView>
        ) : null}
        {view === 'apikey' ? <ApiKeyPanel onDone={close} /> : null}
        {view === 'about' ? <AboutPanel /> : null}
      </ToolFrame>
    </Screen>
  );
}

/** The coach's status from the sidebar's rows (the coach dot): reachable, offline, not set up, or still checking. */
function coachStatusOf(rows: ReturnType<typeof useStatusRows>): 'reachable' | 'unreachable' | 'not-configured' | 'unknown' {
  const c = rows.find(r => r.key === 'coach');
  return c?.dot === 'on' ? 'reachable' : c?.dot === 'bad' ? 'unreachable' : c?.value === 'not set up' ? 'not-configured' : 'unknown';
}

/** The Kit card's last hit: its own component, so a hit re-renders only this (QA2 m7). */
function LastHitLine() {
  const h = useLastHit();
  const v = lastHitView(h);
  return <Text style={styles.cardSub} accessibilityLiveRegion="polite" testID="setup-last-hit">{lastHitLine(h && { note: h.note, velocity: h.velocity, name: v.name })}</Text>;
}

/** Setup → About: the build, and the debug screens in debug builds (they were the sidebar's Dev row). */
function AboutPanel() {
  const links = [
    { label: 'Build info', href: '/about', id: 'about' },
    ...(__DEV__ ? [
      { label: 'MIDI debug', href: '/dev/midi', id: 'midi' }, { label: 'Home server', href: '/dev/server', id: 'server' },
      { label: 'Audio checks', href: '/dev/audio', id: 'audio' }, { label: 'Player', href: '/dev/play', id: 'play' },
    ] : []),
  ];
  return (
    <View style={styles.panel} testID="setup-about">
      <Group title="About" foot={__DEV__ ? 'Debug build: the debug screens are listed here.' : 'The debug screens are in debug builds only.'}>
        {links.map((l, i) => (
          <GroupRow key={l.id} first={i === 0} title={l.label} right={<Chevron />} onPress={() => router.push(l.href)} testID={`setup-about-${l.id}`} />
        ))}
      </Group>
    </View>
  );
}

/** The Kit group's last hit: its own component, so a hit re-renders only this (QA2 m7). */
function LastHit() {
  const hit = lastHitView(useLastHit());
  return (
    <View style={styles.hit} accessibilityLiveRegion="polite" testID="setup-last-hit">
      <Text style={[styles.hitName, hit.pad && { color: color.ink }]}>{hit.name}</Text>
      <Text style={styles.heroSub}>{hit.sub}</Text>
    </View>
  );
}

/** Coach · home server: the URL and token (Keychain), Save and Test connection → /api/health. */
function ServerGroup() {
  const server = getHomeServer();
  const [url, setUrl] = useState(() => server.configured()?.url ?? '');
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | { error: string } | null>(null);
  useEffect(() => { void server.hasToken().then(setSaved, () => {}); }, [server]);
  const now = () => getMidiPort().clock.now();
  const run = async (fn: () => Promise<TestResult | { error: string }>) => {
    setBusy(true);
    try { setResult(await fn()); } finally { setBusy(false); setSaved(await server.hasToken().catch(() => false)); }
  };
  const dirty = !!token || url !== (server.configured()?.url ?? '');
  return (
    <Group title="Coach · home server" foot={SERVER_FOOT} testID="setup-server">
      <GroupRow first>
        <Text style={styles.lbl}>Server</Text>
        <TextInput testID="setup-server-url" style={[styles.field, styles.mono]} value={url} onChangeText={setUrl} placeholder={SERVER_PLACEHOLDER}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" inputMode="url" textContentType="URL" accessibilityLabel="Server address" />
      </GroupRow>
      <GroupRow>
        <Text style={styles.lbl}>Token</Text>
        <TextInput testID="setup-server-token" style={styles.field} value={token} onChangeText={setToken} placeholder={saved ? `${tokenMask(true)} 🔒` : 'paste APP_TOKEN'}
          secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" autoComplete="off" accessibilityLabel="Token, kept in the Keychain" />
      </GroupRow>
      <GroupRow>
        <Button size="small" tone={dirty ? 'blue' : 'white'} label={dirty ? 'Save and test' : 'Test connection'} disabled={busy || (!dirty && !server.configured())}
          onPress={() => void run(() => (dirty ? saveServer(server, validateServerConfig, url, token, now).then(r => { if (!('error' in r)) setToken(''); return r; }) : testConnection(server, now)))}
          testID="setup-server-test" />
        <View style={styles.result} accessibilityLiveRegion="polite" testID="setup-server-result">
          {busy ? <Text style={styles.val}>Testing…</Text>
            : !result ? null
            : 'error' in result ? <Text style={[styles.resultText, { color: color.bad }]} numberOfLines={2}>{result.error}</Text>
            : result.ok ? <Text style={[styles.resultText, { color: color.good }]} numberOfLines={2}>✓ {result.text}{result.lines.length ? ` · ${result.lines[0]}` : ''}</Text>
            : <Text style={[styles.resultText, { color: color.bad }]} numberOfLines={3}>{result.title}. {result.hint}</Text>}
        </View>
      </GroupRow>
    </Group>
  );
}

function ApiKeyGroup({ onOpen, editing }: { onOpen: () => void; editing: boolean }) {
  const [set, setSet] = useState(false);
  // The Keychain is read once, and again when the API-key tool opens or closes (QA m3: not after every render).
  useEffect(() => {
    let live = true;
    void hasApiKey(keychain).then(v => { if (live) setSet(v); }, () => {});
    return () => { live = false; };
  }, [editing]);
  return (
    <Group title="Coach · fallback" foot={API_KEY_FOOT}>
      <GroupRow first emoji="🔑" sym="yellow" title="Anthropic API key" sub="optional, kept in the Keychain" right={<><Text style={styles.val}>{apiKeyValue(set)}</Text><Chevron /></>}
        onPress={onOpen} testID="setup-api-key" />
    </Group>
  );
}

function ApiKeyPanel({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [set, setSet] = useState(false);
  useEffect(() => { void hasApiKey(keychain).then(setSet, () => {}); }, []);
  return (
    <View style={styles.panel}>
      <Body size={17}>{API_KEY_FOOT}</Body>
      <TextInput testID="apikey-input" style={[styles.field, styles.bigField]} value={key} onChangeText={setKey} placeholder={set ? 'saved: paste a new key to replace it' : 'sk-ant-…'}
        secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" autoComplete="off" accessibilityLabel="Anthropic API key" />
      {error ? <Body size={15} color={color.bad} weight="700">{error}</Body> : null}
      <View style={styles.row}>
        <Button tone="blue" label="Save in the Keychain" onPress={() => void saveApiKey(keychain, key).then(r => (r.ok ? onDone() : setError(r.error)), () => setError('The Keychain refused it.'))} testID="apikey-save" />
        {set ? <Button tone="red" label="Remove" onPress={() => void removeApiKey(keychain).then(onDone, onDone)} testID="apikey-remove" /> : null}
      </View>
      <ModelField />
    </View>
  );
}

/** The fallback's model (CLAUDE.md: CLAUDE_MODEL, default claude-sonnet-5-5). Saved as typed; empty goes back to the default. */
function ModelField() {
  const [model, setModel] = useState(() => kv().get(COACH_MODEL_KEY) ?? '');
  const [error, setError] = useState('');
  const save = () => {
    const m = cleanCoachModel(model);
    if (m === null) { setError('A model id is letters, digits, dots and dashes, e.g. claude-sonnet-5-5'); return; }
    setError('');
    if (m) kv().set(COACH_MODEL_KEY, m); else kv().remove(COACH_MODEL_KEY);
  };
  return (
    <View style={styles.row}>
      <Text style={styles.lbl}>Model</Text>
      <TextInput testID="apikey-model" style={[styles.field, styles.mono]} value={model} onChangeText={setModel} onEndEditing={save} placeholder={DEFAULT_FALLBACK_MODEL}
        autoCapitalize="none" autoCorrect={false} spellCheck={false} accessibilityLabel="Model for the API-key fallback" />
      {error ? <Body size={14} color={color.bad} weight="700">{error}</Body> : null}
    </View>
  );
}

function InputPicker({ conn, onPicked }: { conn: ReturnType<typeof useKitConnection>; onPicked: () => void }) {
  const list = inputChoices(conn.inputs);
  return (
    <View style={styles.panel}>
      <Group title="MIDI inputs" foot="The e-Drum is picked by itself when it's plugged in. Pick another input only if you use a different kit or Network MIDI.">
        {list.length ? list.map((i, k) => (
          <GroupRow key={i.id} first={k === 0} emoji={i.online ? '🎹' : '⏸'} sym={i.online ? 'green' : 'gray'} title={i.name} sub={[i.manufacturer, i.online ? 'online' : 'offline'].filter(Boolean).join(' · ')}
            right={conn.connected?.id === i.id ? <Pill tone="green">✓ connected</Pill> : <Button size="small" label="Use this" disabled={!i.online} onPress={() => { conn.select(i); onPicked(); }} testID={`input-${i.id}`} />} />
        )) : <GroupRow first title={conn.midi ? 'No MIDI inputs' : 'MIDI needs the Drum Coach build on the iPad'} sub="Plug the module into the USB-C port." />}
      </Group>
    </View>
  );
}

/** Kit test (web Setup → Kit test): the kit lights on every hit; tap a drum to play it; the hit timeline under it. */
function KitTest() {
  const last = useLastHit();
  const hit = lastHitView(last);
  const [hits] = useState<Subscribe<PadHit>>(() => (fn: (h: PadHit) => void) => getAppHitBus().onHit(h => { if (h.pad) fn({ pad: h.pad, velocity: h.velocity, at: h.time }); }));
  useAudioEngine(); // tapped drums sound at once, and again after the app comes back (QA2 M2)
  return (
    <View style={styles.kitTestCol}>
    <View style={styles.kitTest}>
      <View style={styles.kitArea}>
        <KitView hits={hits} layout={TOUCH_KIT} labelSize={22} onPadPress={pad => { audio.playNow(`drum.${pad}`, 1); withoutKitSound(() => getAppHitBus().emitPad(pad, 100)); /* sounded just above: not again by the kit sounds (QA3 m1) */ }} testID="kittest-kit" />
      </View>
      <View style={styles.kitSide}>
        <Group title="Last hit">
          <GroupRow first title={hit.name} sub={hit.sub} right={hit.pad ? <View style={[styles.dot, { backgroundColor: padColor(hit.pad) }]} /> : undefined} testID="kittest-last" />
        </Group>
        <Body size={14} weight="700">{KEYS_LINE}</Body>
      </View>
    </View>
    <TimelineView />
    </View>
  );
}

export default SetupScreen;

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: 18 },
  card: { flex: 1, minWidth: 0, gap: 6, minHeight: 128 },
  cardTodo: { backgroundColor: '#FFE9C7' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { ...font.display, fontSize: 21, color: color.ink, flexShrink: 1 },
  cardSub: { fontSize: 14, fontWeight: '600', color: color.muted },
  dot8: { width: 11, height: 11, borderRadius: 6 },
  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 22 },
  bigRow: { flexBasis: '45%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 88, paddingHorizontal: 18, backgroundColor: color.panel,
    borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(5) },
  bigEmoji: { fontSize: 34 },
  bigTitle: { ...font.display, fontSize: 20, color: color.ink },
  bigSub: { fontSize: 14, fontWeight: '600', color: color.muted },
  pressed: { opacity: 0.75 },
  cols: { flex: 1, flexDirection: 'row', gap: 22, alignItems: 'flex-start' },
  col: { flex: 1, gap: 14, minWidth: 0 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  heroSym: { width: 52, height: 52, borderRadius: 14, borderWidth: stroke.card, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 30 },
  grow: { flex: 1, minWidth: 0 },
  heroTitle: { ...font.display, fontSize: 20, color: color.ink },
  heroSub: { fontSize: 14, fontWeight: '600', color: color.muted },
  hit: { alignItems: 'flex-end', maxWidth: 200 },
  hitName: { ...font.display, fontSize: 17, color: color.muted },
  val: { fontSize: 15, fontWeight: '600', color: color.muted, maxWidth: 230 },
  first: { backgroundColor: color.bad, paddingHorizontal: 7, paddingVertical: 2 },
  firstText: { ...font.display, fontSize: 11, color: color.white, letterSpacing: 0.5 },
  lbl: { width: 70, fontSize: 16, fontWeight: '600', color: color.muted },
  field: { flex: 1, height: 36, borderRadius: 8, backgroundColor: color.cream, borderWidth: stroke.thin, borderColor: color.ink, paddingHorizontal: 12, fontSize: 15, color: color.ink },
  mono: { fontFamily: 'Menlo', fontSize: 13.5 },
  bigField: { flex: 0, height: 48, maxWidth: 640, fontSize: 17 },
  result: { flex: 1, alignItems: 'flex-end' },
  resultText: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  gs: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: color.ink },
  panel: { flex: 1, gap: 16, maxWidth: 820 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  kitTestCol: { flex: 1, gap: 14 },
  kitTest: { flex: 1, flexDirection: 'row', gap: 22 },
  kitArea: { flex: 2.4 },
  kitSide: { flex: 1, gap: 14 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: stroke.thin, borderColor: color.ink },
});

