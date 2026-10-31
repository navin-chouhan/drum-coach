// /dev/parts on the iPad: nothing. The layout harness's parts (fake take, celebration, details) are web only
// (HarnessParts.web.tsx), so none of it is in the iOS bundle (QA4 m3).
import { Redirect } from 'expo-router';

export function HarnessParts() {
  return <Redirect href="/" />;
}
