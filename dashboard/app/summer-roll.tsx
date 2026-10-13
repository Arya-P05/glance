import { Platform, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import SummerRoll from '../features/summer-roll/SummerRoll';

export default function SummerRollPage() {
  if (Platform.OS !== 'web') return <View style={{ padding: 24 }}><Text>Open Summer roll in the web dashboard to make and download photographs.</Text></View>;
  return <><Stack.Screen options={{ title: 'Summer roll', headerShown: false }} /><SummerRoll /></>;
}
