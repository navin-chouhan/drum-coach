// The app's main frame: the black sidebar on the left (Journey, Songs, Practice, Progress, Coach, Setup, as on the
// web) and the section on the dotted ground. Sections are tabs, so each keeps its state while you look elsewhere.
// Full-screen frames (the lesson player, first run) are routes outside this group and hide the sidebar.
import { router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { DevRow, NAV, Sidebar, color, useStatusRows } from '../../src/ui';

// Debug screens (app/dev/*, the build info): a small row in the sidebar of debug builds. The testIDs are A2's home links.
const DEV_LINKS = [
  { label: 'Build', href: '/about', testID: 'home-dev-about-link' },
  { label: 'MIDI', href: '/dev/midi', testID: 'home-dev-midi-link' },
  { label: 'Server', href: '/dev/server', testID: 'home-dev-server-link' },
  { label: 'Audio', href: '/dev/audio', testID: 'home-dev-audio-link' },
  { label: 'Play', href: '/dev/play', testID: 'home-dev-play-link' },
] as const;

function SidebarTabs({ state, navigateToTab }: BottomTabBarProps) {
  const status = useStatusRows();
  const current = state.routes[state.index]?.name ?? 'index';
  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (route) navigateToTab(route.key);
  };
  return (
    <Sidebar
      brandTestID="home-title"
      items={NAV.map(n => ({ key: n.key, label: n.label, emoji: n.emoji, testID: n.testID }))}
      current={current}
      onSelect={go}
      status={status}
      onStatusPress={() => go('setup')}
      extra={__DEV__ ? <DevRow links={DEV_LINKS.map(l => ({ label: l.label, testID: l.testID, onPress: () => router.push(l.href) }))} /> : null}
    />
  );
}

export default function MainLayout() {
  return (
    <Tabs
      tabBar={props => <SidebarTabs {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: 'left', sceneStyle: { backgroundColor: color.ground }, animation: 'none' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journey' }} />
      <Tabs.Screen name="songs" options={{ title: 'Songs' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="setup" options={{ title: 'Setup' }} />
      <Tabs.Screen name="about" options={{ title: 'Build info' }} />
    </Tabs>
  );
}
