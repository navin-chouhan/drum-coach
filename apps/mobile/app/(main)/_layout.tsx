// The app's main frame (D10, owner-approved): the black sidebar on the left with four sections, Journey · Practice ·
// You · Setup, and the section on the dotted ground. Sections are tabs, so each keeps its state while you look
// elsewhere. Songs (a Practice shelf), Coach (the week plan; the chat is a sheet from the coach's bubble) and Build info
// are tabs without a sidebar entry: the sidebar lights their section. /progress redirects to /you (old links).
// The sidebar is expanded on Journey and an icon rail elsewhere until the owner picks with « / » or `\` (remembered).
// Full-screen frames (players, first run, tools) are routes outside this group: no sidebar.
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { FirstRunGate } from '../../src/features/firstRun/FirstRunGate';
import { useLatencyRouteSync } from '../../src/features/setup/useSetup';
import { DevRow, NAV, Sidebar, color, sectionOf, sidebarModeFor, toggledPref, useAppKey, useKitDot, useSidebarPref } from '../../src/ui';

// Debug screens (app/dev/*, the build info): a small row in the sidebar of debug builds. The testIDs are A2's home links.
const DEV_LINKS = [
  { label: 'Build', href: '/about', testID: 'home-dev-about-link' },
  { label: 'MIDI', href: '/dev/midi', testID: 'home-dev-midi-link' },
  { label: 'Server', href: '/dev/server', testID: 'home-dev-server-link' },
  { label: 'Audio', href: '/dev/audio', testID: 'home-dev-audio-link' },
  { label: 'Play', href: '/dev/play', testID: 'home-dev-play-link' },
] as const;

function SidebarTabs({ state, navigateToTab }: BottomTabBarProps) {
  const kit = useKitDot();
  const [pref, setPref] = useSidebarPref();
  const section = sectionOf(state.routes[state.index]?.name ?? 'index');
  const mode = sidebarModeFor(pref, section);
  const toggle = () => setPref(toggledPref(mode));
  useAppKey('\\', toggle);
  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (route) navigateToTab(route.key);
  };
  return (
    <Sidebar
      brandTestID="home-title"
      items={NAV.map(n => ({ key: n.key, label: n.label, emoji: n.emoji, testID: n.testID }))}
      current={section}
      onSelect={go}
      mode={mode}
      onToggle={toggle}
      kit={kit}
      onKitPress={() => go('setup')}
      extra={__DEV__ ? <DevRow links={DEV_LINKS.map(l => ({ label: l.label, testID: l.testID, onPress: () => router.push(l.href) }))} /> : null}
    />
  );
}

export default function MainLayout() {
  useLatencyRouteSync(); // latencyMs follows the audio output (D6: per route) on every screen, not only in Setup
  return (
    <>
    <FirstRunGate />
    <Tabs
      tabBar={props => <SidebarTabs {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'left', sceneStyle: { backgroundColor: color.ground }, animation: 'none' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journey' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
      <Tabs.Screen name="setup" options={{ title: 'Setup' }} />
      <Tabs.Screen name="songs" options={{ title: 'Songs' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="about" options={{ title: 'Build info' }} />
    </Tabs>
    </>
  );
}
