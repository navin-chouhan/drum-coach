// /progress (before D10) is You now: old links, deep links and Maestro flows land there with their ?view=.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ProgressRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/you', params }} />;
}
