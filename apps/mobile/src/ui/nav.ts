// The sidebar's sections (D10 reorganisation, owner-approved): Journey · Practice · You · Setup. Songs is a shelf in
// Practice, Progress and the coach's week plan are You, and the chat opens from the coach's bubble on any screen.
// `key` is the tab (the file under app/(main)/); `testID` lets Maestro flows find each section. Pure.
export const NAV = [
  { key: 'index', route: '/', label: 'Journey', emoji: '🗺️', testID: 'nav-journey' },
  { key: 'practice', route: '/practice', label: 'Practice', emoji: '🎯', testID: 'nav-practice' },
  { key: 'you', route: '/you', label: 'You', emoji: '📈', testID: 'nav-you' },
  { key: 'setup', route: '/setup', label: 'Setup', emoji: '⚙️', testID: 'nav-setup' },
] as const;

export type NavKey = (typeof NAV)[number]['key'];

/** The tabs that aren't sections, and the section they belong to (lit in the sidebar while they show). */
const PARENT: Record<string, NavKey> = { songs: 'practice', progress: 'you', coach: 'you', about: 'setup' };

/** The section a tab belongs to. */
export const sectionOf = (tab: string): NavKey => PARENT[tab] ?? (NAV.some(n => n.key === tab) ? (tab as NavKey) : 'index');

/** How the sidebar shows: expanded (names), the icon rail, or (players, first run, tools) not at all. */
export type SidebarMode = 'expanded' | 'rail';
/** The owner's choice once they press « / » (or `\`): auto until then (expanded on Journey, the rail elsewhere). */
export type SidebarPref = 'auto' | SidebarMode;

export const sidebarModeFor = (pref: SidebarPref, section: NavKey): SidebarMode => (pref === 'auto' ? (section === 'index' ? 'expanded' : 'rail') : pref);
/** « / » or `\`: the other mode, remembered from now on. */
export const toggledPref = (mode: SidebarMode): SidebarMode => (mode === 'expanded' ? 'rail' : 'expanded');
export const parseSidebarPref = (v: string | null): SidebarPref => (v === 'expanded' || v === 'rail' ? v : 'auto');
