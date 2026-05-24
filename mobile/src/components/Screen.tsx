import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  padded?: boolean;
};

export default function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  style,
  padded = true,
}: Props) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.padded, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary[600]} /> : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  flex: {
    flex: 1,
  },
  padded: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
});
