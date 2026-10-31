// Share take (D5): the take's MIDI file (share.ts takeFile) written to the cache with expo-file-system, then the iOS
// share sheet (React Native Share with the file URL: AirDrop, Messages, Mail, Save to Files…). No new package.
import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';
import { takeFile } from './share';
import type { Finished } from './types';

export async function shareTake(f: Finished, title: string): Promise<'shared' | 'dismissed' | 'failed'> {
  try {
    const { name, bytes } = takeFile(f, title);
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    await file.write(bytes);
    const r = await Share.share({ url: file.uri, title: name });
    return r.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    return 'failed';
  }
}
