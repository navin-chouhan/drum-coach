// Debug screen: set up and test the home server (D2) before the Setup screens exist. The token field is write-only:
// a saved token is never read back into the screen.
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { failureText, healthLines, type Line } from '../../src/dev/server/model';
import { getHomeServer, MIN_TOKEN_LENGTH, validateServerConfig } from '../../src/platform/api';
import type { ApiFailure, ServerHealth } from '../../src/platform/contracts';
import { getStorage } from '../../src/platform/storage';
import { colors } from '../../src/theme';

type Status = { kind: 'idle' } | { kind: 'busy'; what: string } | { kind: 'health'; at: Date; health: ServerHealth } | { kind: 'failure'; at: Date; failure: ApiFailure };

function Row({ line }: { line: Line }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{line.label}</Text>
      <Text style={[styles.value, line.tone === 'ok' && styles.ok, line.tone === 'warn' && styles.warn]}>{line.value}</Text>
    </View>
  );
}

function Button({ title, onPress, disabled, testID, kind = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; testID: string; kind?: 'primary' | 'plain' }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, kind === 'plain' && styles.buttonPlain, (pressed || disabled) && styles.pressed]}>
      <Text style={[styles.buttonText, kind === 'plain' && styles.buttonTextPlain]}>{title}</Text>
    </Pressable>
  );
}

export default function ServerDebug() {
  const server = getHomeServer();
  const storage = getStorage();
  const [url, setUrl] = useState(server.configured()?.url ?? '');
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(server.configured());
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [lastError, setLastError] = useState<{ at: Date; text: string } | null>(null);

  const refresh = async () => {
    const has = await server.hasToken();
    setSaved(server.configured());
    setHasToken(has);
  };
  useEffect(() => {
    let live = true;
    void server.hasToken().then(has => { if (live) setHasToken(has); });
    return () => { live = false; };
  }, [server]);

  const test = async () => {
    setStatus({ kind: 'busy', what: 'Testing…' });
    const r = await server.health();
    const at = new Date();
    if (r.ok) setStatus({ kind: 'health', at, health: r });
    else {
      setStatus({ kind: 'failure', at, failure: r });
      setLastError({ at, text: failureText(r).title });
    }
  };

  const save = async () => {
    const v = validateServerConfig(url, token);
    if (!v.ok) { setInputError(v.error); return; }
    setInputError(null);
    setStatus({ kind: 'busy', what: 'Saving…' });
    await server.configure({ url: v.url, token: v.token });
    setToken('');
    setUrl(v.url);
    await refresh();
    await test();
  };

  const forget = async () => {
    await server.configure(null);
    setUrl('');
    setToken('');
    setStatus({ kind: 'idle' });
    await refresh();
  };

  const busy = status.kind === 'busy';
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Home server' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card} testID="server-saved">
          <Text style={styles.cardTitle}>Saved</Text>
          <Row line={{ label: 'Address', value: saved?.url ?? 'none', tone: saved ? 'plain' : 'warn' }} />
          <Row line={{ label: 'Token', value: hasToken === null ? '…' : hasToken ? 'saved in the Keychain' : 'none', tone: hasToken ? 'ok' : 'warn' }} />
          <Row line={{ label: 'Storage', value: storage.openError ? `memory only: ${storage.openError}` : 'drumcoach.db', tone: storage.openError ? 'warn' : 'ok' }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Server</Text>
          <Text style={styles.help}>On the server machine: APP_HOST, ALLOWED_HOSTS and APP_TOKEN in .env (docs/mobile/HOME-SERVER.md).</Text>
          <Text style={styles.fieldLabel}>Address</Text>
          <TextInput testID="server-url" style={styles.input} value={url} onChangeText={setUrl} placeholder="http://192.168.1.20:8787"
            autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" inputMode="url" />
          <Text style={styles.fieldLabel}>Token (APP_TOKEN, at least {MIN_TOKEN_LENGTH} characters)</Text>
          <TextInput testID="server-token" style={styles.input} value={token} onChangeText={setToken}
            placeholder={hasToken ? 'saved: type a new one to replace it' : 'paste APP_TOKEN'}
            secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" autoComplete="off" />
          {inputError ? <Text testID="server-input-error" style={styles.error}>{inputError}</Text> : null}
          <View style={styles.buttons}>
            <Button testID="server-save" title="Save and test" onPress={() => void save()} disabled={busy} />
            <Button testID="server-test" title="Test connection" onPress={() => void test()} disabled={busy || !saved} kind="plain" />
            <Button testID="server-forget" title="Forget" onPress={() => void forget()} disabled={busy || (!saved && !hasToken)} kind="plain" />
          </View>
        </View>

        <View style={styles.card} testID="server-result">
          <Text style={styles.cardTitle}>Result</Text>
          {status.kind === 'idle' ? <Text style={styles.help}>Not tested yet.</Text> : null}
          {status.kind === 'busy' ? <View style={styles.row}><ActivityIndicator /><Text style={styles.help}>{status.what}</Text></View> : null}
          {status.kind === 'health' ? (
            <>
              {healthLines(status.health).map(l => <Row key={l.label} line={l} />)}
              <Text style={styles.help}>Checked {status.at.toLocaleTimeString()}</Text>
            </>
          ) : null}
          {status.kind === 'failure' ? (
            <>
              <Text testID="server-failure" style={styles.error}>{failureText(status.failure).title}</Text>
              <Text style={styles.help}>{failureText(status.failure).hint}</Text>
            </>
          ) : null}
          {lastError && status.kind !== 'failure' ? (
            <Text style={styles.help}>Last error ({lastError.at.toLocaleTimeString()}): {lastError.text}</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 32, gap: 20, maxWidth: 760, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  label: { width: 170, fontSize: 16, color: colors.muted },
  value: { flex: 1, fontSize: 16, color: colors.text },
  ok: { color: colors.ok },
  warn: { color: colors.warn },
  help: { fontSize: 15, color: colors.muted },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text, backgroundColor: colors.background },
  error: { fontSize: 16, color: colors.accent },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 22 },
  buttonPlain: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  pressed: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  buttonTextPlain: { color: colors.primary },
});
