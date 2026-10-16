import { Platform, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

export default function GeneratePage() {
  const { inspiration } = useLocalSearchParams<{ inspiration?: string | string[] }>();

  if (Platform.OS !== 'web') {
    return <View style={{ padding: 24 }}><Text>Open the web dashboard to use the production generator.</Text></View>;
  }

  const selected = Array.isArray(inspiration) ? inspiration.join(',') : inspiration;
  const query = selected ? `?inspiration=${encodeURIComponent(selected)}` : '';
  const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname;

  return <>
    <Stack.Screen options={{ title: 'Generate', headerShown: false }} />
    <iframe
      title="Generate"
      src={`http://${host}:3849/production${query}`}
      style={{ width: '100%', height: '100%', border: 0, background: '#111310' }}
    />
  </>;
}
