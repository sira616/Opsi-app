import { Text, View } from 'react-native';
import { makeStyles, radius, space } from '@/shared/theme/tokens';

export function ErrorNote({ message }: { message: string | null }) {
  const styles = useStyles();
  if (!message) return null;

  return (
    <View accessibilityRole="alert" style={styles.box}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  box: {
    backgroundColor: c.expirySoft,
    borderWidth: 1,
    borderColor: c.expiryLine,
    borderRadius: radius.md,
    padding: space.md,
  },
  text: { fontSize: 13.5, lineHeight: 19, color: c.expiryInk },
}));
