import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '@/theme/tokens';

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <View accessibilityRole="alert" style={styles.box}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.expirySoft,
    borderWidth: 1,
    borderColor: '#F0CFC8',
    borderRadius: radius.md,
    padding: space.md,
  },
  text: { fontSize: 13.5, lineHeight: 19, color: '#6B4038' },
});
