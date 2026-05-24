import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, font, radius, shadows, spacing } from '../theme';

type Props = {
  message: string;
  type?: 'success' | 'error';
  visible: boolean;
  onHide: () => void;
};

export default function Toast({ message, type = 'success', visible, onHide }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [visible, message, onHide, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toast,
        type === 'error' ? styles.error : styles.success,
        { opacity },
      ]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    ...shadows.card,
    zIndex: 999,
  },
  success: {
    backgroundColor: colors.text,
  },
  error: {
    backgroundColor: colors.danger,
  },
  text: {
    color: colors.white,
    fontFamily: font.medium,
    fontSize: 14,
    textAlign: 'center',
  },
});
