import { askCoach, Thinking, useCoachEntry } from '../coach/api';
import type { ShowoffSongs } from '../coach/schemas';
import type { Milestone, Profile } from '../engine/lesson';
import { requestSong } from '../ui/nav';
import { addSong } from '../youtube/api';
import { getSettings, setSettings } from '../input/settings';

/**
 * The stage's song project: the coach suggests real songs this stage gets you ready for; the one you pick becomes the
 * stage's goal (Profile.song), the coach writes song bites from it, and once every bar is ready it's a show-off song.
 */
export function ShowoffCard({ stage, profile, builtin, inline }: { stage: Milestone; profile: Profile; builtin?: { title: string; open: () => void }; inline?: boolean }) {
  const key = `project-${stage.level}`;
  const e = useCoachEntry<ShowoffSongs>(key);
  const learn = async (video: { id: string; title: string }) => {
    const s = await addSong(video.title, video.id);
    setSettings({ profile: { ...getSettings().profile, song: { id: s.id, title: video.title, stage: stage.level } } });
    requestSong(s.id);
  };
  // inline: the "Your song" part of Journey's stage song card (no card, no built-in line: the card shows that song)
  return (
    <div className={inline ? 'showoffInline' : 'card showoff'}>
      {inline ? <span className="small">Your song</span> : <h3>Pick your song for this stage</h3>}
      {builtin && <p>🎵 Your stage song: <button className="link" onClick={builtin.open}><b>{builtin.title}</b></button>, built in, with the band. Or pick a real one:</p>}
      <p className={inline ? 'small' : undefined}>A real song you'll play for your friends. The lessons in <b>{stage.title}</b> get you ready for it, a few bars at a time.</p>
      {e?.status === 'thinking' ? <Thinking what="Your coach is picking songs for this stage" />
        : e?.status === 'done' && e.data ? (
          <ul className="ytResults">
            {e.data.songs.map(s => (
              <li key={s.title}>
                {s.video && <img src={s.video.thumbnail} alt="" width={96} height={54} />}
                <div className="grow"><b>{s.title}</b> · {s.artist}<div className="small">{s.why}</div></div>
                {s.video ? <button className="primary" onClick={() => void learn(s.video!)}>This is my song</button>
                  : <span className="small">Search it on Songs</span>}
              </li>
            ))}
          </ul>
        ) : <>
          {e?.status === 'error' && <p className="warn">{e.error}</p>}
          <button className={inline ? undefined : 'primary'} onClick={() => askCoach(key, 'showoff', { stage: stage.title, canDo: stage.canDo, goals: profile.goals })}>{inline ? 'Pick a real song ▶' : 'Show me songs'}</button>
        </>}
      {!inline && <p className="small">When 16 bars or more are in and every bar is played at 85% or better, it joins your show-off set on Progress, ready for Stage mode.</p>}
    </div>
  );
}
