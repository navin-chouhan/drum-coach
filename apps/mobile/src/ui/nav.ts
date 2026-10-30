// The sidebar's sections, in the web app's order (src/ui/nav.ts: Journey, Songs, Practice, Progress, then Coach and
// Setup). `route` is the file under app/(main)/; `testID` lets Maestro flows find each tab.
export const NAV = [
  { key: 'index', route: '/', label: 'Journey', emoji: '🗺️', testID: 'nav-journey' },
  { key: 'songs', route: '/songs', label: 'Songs', emoji: '🎵', testID: 'nav-songs' },
  { key: 'practice', route: '/practice', label: 'Practice', emoji: '🎯', testID: 'nav-practice' },
  { key: 'progress', route: '/progress', label: 'Progress', emoji: '📈', testID: 'nav-progress' },
  { key: 'coach', route: '/coach', label: 'Coach', emoji: '💬', testID: 'nav-coach' },
  { key: 'setup', route: '/setup', label: 'Setup', emoji: '⚙️', testID: 'nav-setup' },
] as const;

export type NavKey = (typeof NAV)[number]['key'];
