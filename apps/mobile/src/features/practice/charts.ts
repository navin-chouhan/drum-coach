// Practice's exercises on the iPad: the built-ins plus the saved charts in Storage (imported songs, coach exercises)
// and the coach's drills in the key-value store. Read anew on each call (a song imported meanwhile shows up).
import { getStorage } from '../../platform/storage';
import { getCoach } from '../coach';
import { practiceCharts, savedCharts, type PracticeChart } from './catalog';

export const loadPracticeCharts = (): PracticeChart[] =>
  practiceCharts(savedCharts({ stored: () => getStorage().charts?.list() ?? [], coach: () => getCoach().charts.list() }));
