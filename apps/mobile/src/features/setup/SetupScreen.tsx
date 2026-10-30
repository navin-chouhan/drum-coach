// Setup (mockup setup.png; web Setup → Your kit, Kit test, Coach and voice): two columns of grouped lists. Kit (the
// e-Drum, the last hit, the MIDI input), Pads (hit each pad, soft then loud, note map), Latency (per output, with the
// web's "do this first"), Sound and you, Coach · home server, Coach · fallback and While you play. Each tool opens
// full screen over Setup. Kit gestures: the "yes" gesture starts what to do first.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { getHomeServer, validateServerConfig } from '../../platform/api';
import { audio } from '../../platform/audio';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { KitView, type PadHit, type Subscribe } from '../../play';
import { TOUCH_KIT } from '../../play/kitLayout';
import {
  Body, Button, GestureChip, Pill, Screen, Segmented, TitleBar, Toggle, color, font, getAppHitBus, padColor, stroke, useAppSettings, useKitMoves, writeSettings,
} from '../../ui';
import { LatencyPanel } from '../latency/LatencyPanel';
import { LATENCY_FOOT, latencyRow, otherRoutes, readLatencyByRoute, shortDate } from '../latency/latencyByRoute';
import { NoteMapPanel } from '../pads/NoteMapPanel';
import { PadWizardView } from '../pads/PadWizardView';
import { VelocityPanel } from '../pads/VelocityPanel';
import { conflictText, noteMapSummary } from '../pads/kitStore';
import { levelsShort, setupChecks } from './checklist';
import {
  API_KEY_FOOT, SERVER_FOOT, SERVER_PLACEHOLDER, apiKeyValue, hasApiKey, removeApiKey, saveApiKey, saveServer, testConnection, tokenMask, type TestResult,
} from './coachServer';
import { KEYS_LINE, KIT_FOOT, inputChoices, kitStatus, lastHitView } from './kit';
import { Chevron, Group, GroupRow, ToolFrame } from './parts';
import { SoundPanel } from './SoundPanel';
import { useAudioRoute, useKitConnection, useKitData, useLastHit, useLatencyRouteSync, useRecentRuns, keychain } from './useSetup';
import { HAND_SUB, LIVE_TIPS, LIVE_TIPS_SUB, AUTOPILOT_SUB } from './whilePlaying';
import type { Settings } from '@drum-coach/core/input/settings';

type Tool = 'pads' | 'velocity' | 'notemap' | 'latency' | 'sound' | 'kittest' | 'input' | 'apikey';
const TOOL_TITLE: Record<Tool, string> = {
  pads: 'Hit each pad once', velocity: 'Soft, then loud', notemap: 'Note map', latency: 'Latency', sound: 'Sound levels', kittest: 'Kit test',
  input: 'MIDI input', apikey: 'Coach · fallback API key',
};
const kv = () => getStorage().kv;
const save = (p: Partial<Settings>) => writeSettings(kv(), p);

export function SetupScreen() {
  useLatencyRouteSync();
  const s = useAppSettings();
  const conn = useKitConnection();
  const { kit, map, padCal } = useKitData();
  const last = useLastHit();
  const route = useAudioRoute();
  const runs = useRecentRuns();
  const [tool, setTool] = useState<Tool | null>(null);
  const status = kitStatus(conn.midi, conn.connected);
  const checks = setupChecks({ settings: s, padCal, runs, device: conn.connected?.name ?? null });
  const latency = checks.find(c => c.id === 'latency')!;
  const pads = checks.find(c => c.id === 'pads')!;
  const byRoute = readLatencyByRoute(kv());
  const lat = latencyRow(byRoute, route, s);
  const others = otherRoutes(byRoute, route?.key ?? null);
  const hit = lastHitView(last);
  const clash = conflictText(map);
  const close = () => setTool(null);

  // Hands-free: the "yes" gesture starts the check to do first (latency), else hit each pad.
  useKitMoves({ yes: () => setTool(latency.first ? 'latency' : 'pads') }, { enabled: tool === null });

  return (
    <Screen testID="screen-setup">
      <TitleBar title="Setup" right={<Button label="Kit test" emoji="🥁" size="small" onPress={() => setTool('kittest')} testID="setup-kit-test" />} />
      <View style={styles.cols}>
        <View style={styles.col}>
          <Group title="Kit" foot={KIT_FOOT} testID="setup-kit">
            <View style={styles.hero}>
              <View style={[styles.heroSym, { backgroundColor: status.connected ? color.good : color.toggleOff }]}><Text style={styles.heroEmoji}>🥁</Text></View>
              <View style={styles.grow}>
                <Text style={styles.heroTitle} testID="setup-kit-name">{status.title}</Text>
                <Text style={styles.heroSub} numberOfLines={2}>{status.sub}</Text>
              </View>
              <View style={styles.hit} accessibilityLiveRegion="polite" testID="setup-last-hit">
                <Text style={[styles.hitName, hit.pad && { color: color.ink }]}>{hit.name}</Text>
                <Text style={styles.heroSub}>{hit.sub}</Text>
              </View>
            </View>
            <GroupRow emoji="🔌" sym="gray" title="MIDI input" right={<><Text style={styles.val}>{conn.connected?.name ?? (conn.inputs.length ? 'none' : 'no inputs')}</Text><Chevron /></>}
              onPress={() => setTool('input')} testID="setup-midi-input" accessibilityLabel={`MIDI input: ${conn.connected?.name ?? 'none'}`} />
          </Group>

          <Group title="Pads">
            <GroupRow first emoji="🎯" sym="indigo" title="Hit each pad once"
              sub={clash ? 'two pads share a note: hit each pad again' : s.padsCheckedAt ? `checked ${shortDate(s.padsCheckedAt)}` : pads.done ? 'done in the first run' : 'so a hit on tom 1 counts as tom 1 · 30 s'}
              right={<Button size="small" tone={pads.done ? 'white' : 'blue'} label={pads.done ? 'Again' : 'Start ▶'} onPress={() => setTool('pads')} testID="setup-pads" />} />
            <GroupRow emoji="🎧" sym="teal" title="Soft, then loud" sub="accents and ghost notes judged fairly"
              right={<>{Object.keys(padCal).length ? <Pill tone="green">✓ done</Pill> : <Text style={styles.val}>2 min</Text>}<Chevron /></>}
              onPress={() => setTool('velocity')} testID="setup-velocity" />
            <GroupRow emoji="🎸" sym="gray" title="Note map" right={<><Text style={styles.val} numberOfLines={1}>{noteMapSummary(map)}</Text><Chevron /></>}
              onPress={() => setTool('notemap')} testID="setup-notemap" />
          </Group>

          <Group title="Latency" foot={latency.why ?? (others.length ? `${LATENCY_FOOT} Also measured: ${others.join(', ')}.` : LATENCY_FOOT)}>
            <GroupRow first emoji="⏱" sym="orange" title={lat.title} sub={lat.sub} testID="setup-latency"
              right={<>{latency.first ? <View style={styles.first}><Text style={styles.firstText}>DO THIS FIRST</Text></View> : null}
                <Button size="small" tone="blue" label="Measure" onPress={() => setTool('latency')} testID="setup-latency-measure" /></>} />
          </Group>

          <Group title="Sound and you">
            <GroupRow first emoji="🔊" sym="blue" title="Sound levels" sub={levelsShort(s)} right={<Chevron />} onPress={() => setTool('sound')} testID="setup-sound" />
            <GroupRow emoji="👆" sym="gray" title="Which hand leads" sub={HAND_SUB}
              right={<Segmented accessibilityLabel="Which hand leads" value={s.leftHanded ? 'left' : 'right'} onChange={v => save({ leftHanded: v === 'left' })}
                options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]} testID="setup-hand" />} />
          </Group>
        </View>

        <View style={styles.col}>
          <ServerGroup />
          <ApiKeyGroup onOpen={() => setTool('apikey')} />
          <Group title="While you play">
            <GroupRow first title="Live tips" sub={LIVE_TIPS_SUB}
              right={<Segmented accessibilityLabel="Live tips" value={s.liveTips} onChange={liveTips => save({ liveTips })}
                options={LIVE_TIPS.map(([value, label]) => ({ value, label }))} testID="setup-live-tips" />} />
            <GroupRow right={<Toggle label="Kit gestures" value={s.padCommands !== false} onChange={padCommands => save({ padCommands })} testID="setup-gestures" />}>
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>Kit gestures</Text>
                <View style={styles.gs}>
                <GestureChip gesture={{ pad: 'hhPedal', times: 3 }} />
                <GestureChip gesture={{ pad: 'tom2', times: 2 }} />
                <GestureChip gesture={{ pad: 'ride', times: 2 }} />
                </View>
              </View>
            </GroupRow>
            <GroupRow title="Autopilot" sub={AUTOPILOT_SUB} right={<Toggle label="Autopilot" value={!!s.autopilot} onChange={autopilot => save({ autopilot })} testID="setup-autopilot" />} />
          </Group>
        </View>
      </View>

      <ToolFrame visible={tool !== null} title={tool ? TOOL_TITLE[tool] : ''} onClose={close} testID={`setup-tool-${tool ?? 'none'}`}>
        {tool === 'pads' ? <PadWizardView kit={kit} map={map} onSaved={close} onStop={close} /> : null}
        {tool === 'velocity' ? <VelocityPanel kit={kit} map={map} padCal={padCal} kitConnected={!!conn.connected} /> : null}
        {tool === 'notemap' ? <NoteMapPanel kit={kit} map={map} /> : null}
        {tool === 'latency' ? <LatencyPanel onSaved={close} /> : null}
        {tool === 'sound' ? <SoundPanel /> : null}
        {tool === 'kittest' ? <KitTest /> : null}
        {tool === 'input' ? <InputPicker conn={conn} onPicked={close} /> : null}
        {tool === 'apikey' ? <ApiKeyPanel onDone={close} /> : null}
      </ToolFrame>
    </Screen>
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

function ApiKeyGroup({ onOpen }: { onOpen: () => void }) {
  const [set, setSet] = useState(false);
  useEffect(() => { void hasApiKey(keychain).then(setSet, () => {}); });
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

/** Kit test (web Setup → Kit test): the kit lights on every hit; tap a drum to play it. */
function KitTest() {
  const last = useLastHit();
  const hit = lastHitView(last);
  const [hits] = useState<Subscribe<PadHit>>(() => (fn: (h: PadHit) => void) => getAppHitBus().onHit(h => { if (h.pad) fn({ pad: h.pad, velocity: h.velocity, at: h.time }); }));
  useEffect(() => { void audio.start().catch(() => {}); }, []);
  return (
    <View style={styles.kitTest}>
      <View style={styles.kitArea}>
        <KitView hits={hits} layout={TOUCH_KIT} labelSize={22} onPadPress={pad => { getAppHitBus().emitPad(pad, 100); audio.playNow(`drum.${pad}`, 1); }} testID="kittest-kit" />
      </View>
      <View style={styles.kitSide}>
        <Group title="Last hit">
          <GroupRow first title={hit.name} sub={hit.sub} right={hit.pad ? <View style={[styles.dot, { backgroundColor: padColor(hit.pad) }]} /> : undefined} testID="kittest-last" />
        </Group>
        <Body size={14} weight="700">{KEYS_LINE.replace('No kit? Keys:', 'No kit? Tap a drum. A hardware keyboard needs a later build:')}</Body>
      </View>
    </View>
  );
}

export default SetupScreen;

const styles = StyleSheet.create({
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
  kitTest: { flex: 1, flexDirection: 'row', gap: 22 },
  kitArea: { flex: 2.4 },
  kitSide: { flex: 1, gap: 14 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: stroke.thin, borderColor: color.ink },
});

