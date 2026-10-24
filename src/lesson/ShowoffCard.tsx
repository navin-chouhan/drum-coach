import { askCoach, Thinking, useCoachEntry } from '../coach/api';
import type { ShowoffSongs } from '../coach/schemas';
import type { Milestone, Profile } from '../engine/lesson';
import { requestSong } from '../ui/nav';
import { addSong } from '../youtube/api';

/** The reward for a passed stage: the coach suggests real songs you can now play for friends. */
export function ShowoffCard({ stage, profile }: { stage: Milestone; profile: Profile }) {
  const key = `showoff-${stage.level}`;
  const e = useCoachEntry<ShowoffSongs>(key);
  const learn = async (video: { id: string; title: string }) => { const s = await addSong(video.title, video.id); requestSong(s.id); };
  return (
    <div className="card showoff">
      <h3>Your show-off song</h3>
      <p>You're a <b>{stage.rank}</b> now. Learn a real song you can play for your friends.</p>
      {e?.status === 'thinking' ? <Thinking what="Your coach is picking songs you can already play" />
        : e?.status === 'done' && e.data ? (
          <ul className="ytResults">
            {e.data.songs.map(s => (
              <li key={s.title}>
                {s.video && <img src={s.video.thumbnail} alt="" width={96} height={54} />}
                <div className="grow"><b>{s.title}</b> · {s.artist}<div className="small">{s.why}</div></div>
                {s.video ? <button className="primary" onClick={() => void learn(s.video!)}>Learn this one</button>
                  : <span className="small">Search it on Songs</span>}
              </li>
            ))}
          </ul>
        ) : <>
          {e?.status === 'error' && <p className="warn">{e.error}</p>}
          <button className="primary" onClick={() => askCoach(key, 'showoff', { stage: stage.title, canDo: stage.canDo, goals: profile.goals })}>Pick my show-off songs</button>
        </>}
      <p className="small">Play it scored on Songs at 85% or better and it joins your show-off set on Trophies, ready for Stage mode.</p>
    </div>
  );
}
