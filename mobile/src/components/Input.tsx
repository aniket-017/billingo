import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export default function Input({ label, error, style, ...props }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, focused && styles.labelFocused]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.surface[300]}
        cursorColor={colors.primary[600]}
        selectionColor={colors.primary[100]}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          style,
        ]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontFamily: font.semiBold,
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelFocused: {
    color: colors.primary[600],
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.surface[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.white,
  },
  inputFocused: {
    borderColor: colors.primary[500],
    backgroundColor: '#fafcff',
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    fontSize: 13,
    fontFamily: font.regular,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
