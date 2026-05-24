import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadows, spacing } from '../theme';

type Props = {
  label: string;
  value: string;
  subtitle?: string;
  accent?: string;
};

export default function StatCard({ label, value, subtitle, accent = colors.primary[600] }: Props) {
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderLeftWidth: 4,
    ...shadows.card,
    flex: 1,
    minWidth: 140,
  },
  label: {
    fontSize: 13,
    fontFamily: font.medium,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: 22,
    fontFamily: font.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: font.regular,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
