import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/src/api/client';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, font, spacing } from '@/src/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter email and password');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await api.auth.login(email.trim(), password);
      if (user.role === 'platform_admin') {
        setError('Platform admin accounts must use the web admin panel.');
        return;
      }
      await login(token, {
        id: user.id,
        email: user.email,
        name: user.name || '',
        role: user.role as 'user' | 'business_admin',
        businessId: user.businessId,
        businessName: user.businessName,
      });
      router.replace('/(tabs)/sale');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>₹</Text>
            </View>
            <Text style={styles.title}>Barcode Billing</Text>
            <Text style={styles.subtitle}>Sign in to your store account</Text>
          </View>

          <Card>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@store.com"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="••••••••"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Sign in" onPress={handleLogin} loading={loading} />
          </Card>
        </View>
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
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: {
    fontSize: 28,
    fontFamily: font.bold,
    color: colors.white,
  },
  title: {
    fontSize: 28,
    fontFamily: font.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontFamily: font.medium,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
