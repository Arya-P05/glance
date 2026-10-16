import { Platform, Text, View } from 'react-native';
import { Stack } from 'expo-router';

export default function GenerationLabPage() {
  if (Platform.OS !== 'web') return <View style={{ padding: 24 }}><Text>Open the web dashboard to compare generation experiments.</Text></View>;
  return <><Stack.Screen options={{ title: 'Generation lab', headerShown: false }} /><iframe title="Generation lab" src={`http://${typeof window === 'undefined' ? 'localhost' : window.location.hostname}:3849`} style={{ width: '100%', height: '100%', border: 0, background: '#131413' }} /></>;
}
