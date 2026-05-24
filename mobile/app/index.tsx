import { Redirect } from 'expo-router';
import { useAuth } from '@/src/contexts/AuthContext';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '@/src/theme';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/sale" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface[50],
  },
});
