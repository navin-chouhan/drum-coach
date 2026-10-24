import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { saveChart } from '../content/charts';
import { getSettings, subscribeSettings } from '../input/settings';
import type { Finished } from '../play/player';
import { requestPlay } from '../ui/nav';
import { askCoach, Thinking, useCoachEntry } from './api';
import { say } from '../voice/voice';
import type { Feedback } from './schemas';
import { summarizeRun } from './summary';

const spokenKeys = new Set<string>();
/** Says the coach's main point once per answer (when "speak" is on). */
export function speakOnce(key: string, f: Feedback) {
  if (spokenKeys.has(key) || !getSettings().voice) return;
  spokenKeys.add(key);
  void say(f.spoken ?? f.feedback.split(/(?<=[.!?])\s/)[0]);
}

export function CoachFeedback({ f }: { f: Finished }) {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const summary = useMemo(() => summarizeRun(f), [f]);
  const key = `feedback:${f.startedAt}`;
  const e = useCoachEntry<Feedback>(key);
  const ask = () => askCoach(key, 'feedback', { summary });
  useEffect(() => { if (settings.autoCoach) askCoach(key, 'feedback', { summary }); }, [key, summary, settings.autoCoach]);
  useEffect(() => { if (e?.status === 'done' && e.data) speakOnce(key, e.data); }, [key, e?.status, e?.data]);

  async function playDrill(d: Feedback['drill']) {
    if (d.chart) { const c = await saveChart(d.chart, 'ai'); requestPlay({ chartId: c.id, bpm: d.bpm }); }
    else if (d.chartId) requestPlay({ chartId: d.chartId, bpm: d.bpm });
  }

  return (
    <div className="card coach">
      <h3>Coach</h3>
      {!e && <button className="primary" onClick={ask}>Ask the coach about this run</button>}
      {e?.status === 'thinking' && <Thinking />}
      {e?.status === 'error' && <><p className="warn">{e.error}</p><button onClick={ask}>Try again</button></>}
      {e?.status === 'done' && e.data && (
        <>
          <p>{e.data.feedback}</p>
          <div className="drill">
            <b>Drill: {e.data.drill.title}</b>{e.data.drill.bpm && <> · {e.data.drill.bpm} BPM</>}
            <p>{e.data.drill.instructions}</p>
            {(e.data.drill.chart || e.data.drill.chartId) && <button onClick={() => playDrill(e.data!.drill)}>Play this drill</button>}
          </div>
          {e.cached && <p className="small">(saved answer)</p>}
        </>
      )}
    </div>
  );
}
