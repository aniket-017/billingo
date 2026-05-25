import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/src/api/client';
import Input from '@/src/components/Input';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, font, radius, spacing } from '@/src/theme';

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
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.container}>
              <View style={styles.header}>
                <Image
                  source={require('@/assets/images/plan2automate.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.welcomeTitle}>Welcome back</Text>
              <Text style={styles.welcomeSub}>Sign in to your account to continue</Text>

              <View style={styles.form}>
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

                <Pressable
                  onPress={handleLogin}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.signInBtn,
                    loading && styles.signInBtnDisabled,
                    pressed && styles.signInBtnPressed,
                  ]}
                >
                  <Text style={styles.signInText}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.footer}>
                Powered by{' '}
                <Text style={styles.footerBrand}>Plan2Automate</Text>
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f0f9ff',
  },
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    paddingHorizontal: 28,
    paddingVertical: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 220,
    height: 220,
  },
  welcomeTitle: {
    fontSize: 26,
    fontFamily: font.bold,
    color: colors.text,
    textAlign: 'center',
  },
  welcomeSub: {
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 32,
  },
  form: {
    gap: 0,
  },
  error: {
    color: colors.danger,
    fontFamily: font.medium,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  signInBtn: {
    backgroundColor: colors.primary[600],
    borderRadius: radius.md,
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  signInBtnDisabled: {
    opacity: 0.6,
  },
  signInBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  signInText: {
    color: colors.white,
    fontSize: 17,
    fontFamily: font.semiBold,
    letterSpacing: 0.3,
  },
  footer: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 13,
    fontFamily: font.regular,
    color: colors.textMuted,
  },
  footerBrand: {
    fontFamily: font.semiBold,
    color: colors.primary[600],
  },
});
