import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

export default function Input({ label, error, style, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<TextInput>(null);

  const isNumeric = props.keyboardType === 'numeric' || props.keyboardType === 'decimal-pad';

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, focused && styles.labelFocused]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.surface[300]}
        cursorColor={colors.text}
        selectionColor="rgba(59,130,246,0.25)"
        selectTextOnFocus={isNumeric}
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
    fontSize: 12,
    fontFamily: font.semiBold,
    color: colors.textMuted,
    marginBottom: 4,
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
    paddingVertical: 12,
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
