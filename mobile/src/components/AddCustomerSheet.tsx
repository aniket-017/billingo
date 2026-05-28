import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Customer } from '@/src/api/client';
import Button from '@/src/components/Button';
import Input from '@/src/components/Input';
import { colors, font, radius, spacing } from '@/src/theme';
import {
  findCustomerByPhoneInList,
  normalizeCustomerPhone,
  parsePhoneConflictName,
  validateCustomerPhoneInput,
} from '@/src/utils/customerPhone';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCustomerReady: (customer: Customer) => void;
  customers: Customer[];
  initialName?: string;
};

export default function AddCustomerSheet({
  visible,
  onClose,
  onCustomerReady,
  customers,
  initialName = '',
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverMatch, setServerMatch] = useState<Customer | null>(null);
  const [phoneSuggestions, setPhoneSuggestions] = useState<Customer[]>([]);

  const localMatch = useMemo(
    () => findCustomerByPhoneInList(customers, phone),
    [customers, phone]
  );
  const existingMatch = localMatch ?? serverMatch;
  const phoneDigits = useMemo(() => phone.replace(/\D/g, ''), [phone]);

  useEffect(() => {
    if (!visible) {
      setName('');
      setPhone('');
      setNameError('');
      setPhoneError('');
      setServerMatch(null);
      setPhoneSuggestions([]);
      return;
    }
    if (initialName) setName(initialName);
    const phoneCheck = validateCustomerPhoneInput(phone);
    if (!phoneCheck.ok || !phoneCheck.phone) {
      setServerMatch(null);
      return;
    }
    const t = setTimeout(async () => {
      if (findCustomerByPhoneInList(customers, phone)) {
        setServerMatch(null);
        setPhoneSuggestions([]);
        return;
      }
      try {
        const results = await api.customers.list(phoneCheck.phone);
        const hit = findCustomerByPhoneInList(results.items, phone);
        setServerMatch(hit ?? null);
      } catch {
        setServerMatch(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [visible, phone, customers]);

  useEffect(() => {
    if (!visible || phoneDigits.length < 3) {
      setPhoneSuggestions([]);
      return;
    }
    const localCandidates = customers
      .filter((customer) => {
        const normalized = normalizeCustomerPhone(customer.phone);
        return !!normalized && normalized.includes(phoneDigits);
      })
      .slice(0, 6);

    const seen = new Set(localCandidates.map((customer) => customer.id));
    setPhoneSuggestions(localCandidates);

    const t = setTimeout(async () => {
      try {
        const result = await api.customers.list(phoneDigits);
        const merged = [...localCandidates];
        result.items.forEach((customer) => {
          if (!seen.has(customer.id)) {
            seen.add(customer.id);
            merged.push(customer);
          }
        });
        setPhoneSuggestions(merged.slice(0, 6));
      } catch {
        setPhoneSuggestions(localCandidates);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [visible, customers, phoneDigits]);

  function close() {
    onClose();
  }

  function selectExisting(customer: Customer) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCustomerReady(customer);
    close();
  }

  async function save() {
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError('');
    const phoneCheck = validateCustomerPhoneInput(phone);
    if (!phoneCheck.ok) {
      setPhoneError(phoneCheck.message);
      return;
    }
    setPhoneError('');

    const known = findCustomerByPhoneInList(customers, phone) ?? serverMatch;
    if (known) {
      selectExisting(known);
      return;
    }

    setSaving(true);
    try {
      const created = await api.customers.create({
        name: name.trim(),
        phone: phoneCheck.phone,
      });
      selectExisting(created);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not add customer';
      const conflictName = parsePhoneConflictName(message);
      if (conflictName && phoneCheck.phone) {
        try {
          const results = await api.customers.list(phoneCheck.phone);
          const hit =
            findCustomerByPhoneInList(results.items, phone) ??
            results.items.find((c) => c.name === conflictName);
          if (hit) {
            selectExisting(hit);
            return;
          }
        } catch {
          // fall through to error display
        }
      }
      setPhoneError(message);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = name.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavWrapper}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          <View style={styles.handle} />
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Add customer</Text>
            <Text style={styles.subtitle}>They'll be selected for this sale right away.</Text>

            <Input
              label="Phone"
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                if (phoneError) setPhoneError('');
              }}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              autoFocus
              error={phoneError}
            />
            {phoneSuggestions.length > 0 ? (
              <View style={styles.suggestionWrap}>
                <Text style={styles.suggestionTitle}>Matching customers</Text>
                {phoneSuggestions.map((customer, idx) => (
                  <Pressable
                    key={customer.id}
                    style={({ pressed }) => [
                      styles.suggestionRow,
                      pressed && styles.suggestionRowPressed,
                      idx < phoneSuggestions.length - 1 && styles.suggestionRowDivider,
                    ]}
                    onPress={() => selectExisting(customer)}>
                    <View style={styles.suggestionAvatar}>
                      <Ionicons name="person-outline" size={16} color={colors.primary[600]} />
                    </View>
                    <View style={styles.suggestionBody}>
                      <Text style={styles.suggestionName} numberOfLines={1}>
                        {customer.name}
                      </Text>
                      <Text style={styles.suggestionPhone}>{customer.phone}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.surface[300]} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Input
              label="Name"
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (nameError) setNameError('');
              }}
              placeholder="Customer name"
              error={nameError}
            />

            {existingMatch ? (
              <Pressable
                style={styles.matchCard}
                onPress={() => selectExisting(existingMatch)}>
                <View style={styles.matchIcon}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                </View>
                <View style={styles.matchBody}>
                  <Text style={styles.matchTitle}>Already saved</Text>
                  <Text style={styles.matchName}>{existingMatch.name}</Text>
                  {existingMatch.phone ? (
                    <Text style={styles.matchPhone}>{existingMatch.phone}</Text>
                  ) : null}
                </View>
                <Text style={styles.matchAction}>{`Use \u2192`}</Text>
              </Pressable>
            ) : null}

            <Button
              title={existingMatch ? 'Use for this sale' : 'Add & select'}
              onPress={existingMatch ? () => selectExisting(existingMatch) : save}
              loading={saving}
              disabled={!canSubmit}
            />
            <Button title="Cancel" variant="ghost" onPress={close} style={styles.cancelBtn} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface[300],
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  suggestionWrap: {
    borderWidth: 1,
    borderColor: colors.surface[200],
    borderRadius: radius.md,
    backgroundColor: colors.white,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  suggestionTitle: {
    fontFamily: font.semiBold,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface[50],
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  suggestionRowPressed: {
    backgroundColor: colors.surface[50],
  },
  suggestionRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface[200],
  },
  suggestionAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[50],
  },
  suggestionBody: {
    flex: 1,
  },
  suggestionName: {
    fontFamily: font.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  suggestionPhone: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  matchIcon: {
    width: 28,
    alignItems: 'center',
  },
  matchBody: {
    flex: 1,
  },
  matchTitle: {
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matchName: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.text,
    marginTop: 2,
  },
  matchPhone: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  matchAction: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.primary[600],
  },
  cancelBtn: {
    marginTop: spacing.xs,
  },
});
