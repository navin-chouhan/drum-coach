import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { syncFromServer } from './input/store';
import { getSettings, serverIsNewer, setSettings, type Settings } from './input/settings';
import { refreshAiLessons } from './lesson/aiLessons';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

void refreshAiLessons();
void syncFromServer().then(all => {
  const server = all.app as Partial<Settings> | undefined;
  if (serverIsNewer(getSettings(), server)) setSettings(server!, false);
  else if (getSettings().updatedAt) setSettings({}, true); // browser is newer: push it, keeping its timestamp fresh
});

// Dev only: drive the app from the console, e.g. drumCoach.emitNote(38, 100)
if (import.meta.env.DEV) void Promise.all([import('./input/hits'), import('./play/player')]).then(([hits, play]) => {
  Object.assign(window, { drumCoach: { emitNote: hits.emitNote, player: play.player } });
});
