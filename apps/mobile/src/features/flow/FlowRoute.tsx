// /flow: the web's 🌊 Flow tile. It opens the lesson player in flow mode (/lesson/<id>?mode=flow) on flowTile's lesson
// (the built-in lessons plus the coach's, as Journey lists them). Nothing to draw but a moment's wait.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { getStorage } from '../../platform/storage';
import { Body, Button, Card, DottedGround, readSettings } from '../../ui';
import { allLessons } from '../journey/source';
import { lessonHref } from '../lesson/route';
import { flowTile } from './flow';

export function FlowRoute() {
  const [none, setNone] = useState(false);
  useEffect(() => {
    let live = true;
    const st = getStorage();
    void (st.aiLessons?.list().catch(() => []) ?? Promise.resolve([])).then(ai => {
      if (!live) return;
      const t = flowTile(allLessons(ai), readSettings(st.kv));
      if (t) router.replace(lessonHref(t.lessonId, -1, 'flow')); else setNone(true);
    });
    return () => { live = false; };
  }, []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <DottedGround style={{ justifyContent: 'center', alignItems: 'center' }}>
      {none ? <Card style={{ gap: 12, maxWidth: 520 }} testID="flow-none">
        <Body size={18}>No groove to flow on yet. Finish a groove lesson first.</Body>
        <Button label="← Journey" onPress={back} testID="flow-back" />
      </Card> : null}
    </DottedGround>
  );
}
