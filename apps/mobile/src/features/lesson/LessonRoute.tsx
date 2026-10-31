// The lesson routes' body: loads the lesson (or the drill's chart), then the player; a lesson that no longer exists
// says so, as the web does.
import { router } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Card, DottedGround } from '../../ui';
import { LessonScreen } from './LessonScreen';
import type { LessonParams } from './route';
import { useLesson } from './useLesson';

export function LessonRoute({ params, drill }: { params: LessonParams; drill?: { chartId: string; bpm?: number } }) {
  const h = useLesson(params, drill);
  if (!h) return <DottedGround />;
  if ('missing' in h) {
    return (
      <DottedGround>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Card style={{ gap: 14, width: 460 }} testID="lesson-missing">
            <Body size={18} weight="700">{drill ? 'This drill no longer exists.' : 'This lesson no longer exists.'}</Body>
            <Button label="Back to Journey" testID="lesson-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          </Card>
        </View>
      </DottedGround>
    );
  }
  return <LessonScreen ctl={h.ctl} take={h.take} />;
}
