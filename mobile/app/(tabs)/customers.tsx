import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, type Customer } from '@/src/api/client';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import Toast from '@/src/components/Toast';
import { colors, font, radius, spacing } from '@/src/theme';
import { validateCustomerPhoneInput } from '@/src/utils/customerPhone';

type FormState = { name: string; phone: string; email: string; address: string };

const emptyForm: FormState = { name: '', phone: '', email: '', address: '' };

export default function CustomersScreen() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const list = await api.customers.list(q || undefined);
      setCustomers(list);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setPhoneError('');
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, email: c.email, address: c.address });
    setPhoneError('');
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setToast({ message: 'Name is required', type: 'error' });
      return;
    }
    const phoneCheck = validateCustomerPhoneInput(form.phone);
    if (!phoneCheck.ok) {
      setPhoneError(phoneCheck.message);
      return;
    }
    setPhoneError('');
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: phoneCheck.phone,
        email: form.email.trim(),
        address: form.address.trim(),
      };
      if (editing) {
        await api.customers.update(editing.id, body);
      } else {
        await api.customers.create(body);
      }
      setModalOpen(false);
      setToast({ message: editing ? 'Customer updated' : 'Customer added', type: 'success' });
      load(query);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen refreshing={loading} onRefresh={() => load(query)}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Customers</Text>
        <Button title="Add" onPress={openCreate} style={styles.addBtn} />
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search customers"
        style={styles.search}
      />

      {customers.map((c) => (
        <Pressable key={c.id} onPress={() => openEdit(c)}>
          <Card style={styles.row}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.meta}>
              {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}
            </Text>
          </Card>
        </Pressable>
      ))}

      {!loading && customers.length === 0 ? (
        <Text style={styles.empty}>No customers found</Text>
      ) : null}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setModalOpen(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{editing ? 'Edit customer' : 'New customer'}</Text>
          <Input label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Input
            label="Phone"
            value={form.phone}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
            keyboardType="phone-pad"
            error={phoneError}
          />
          <Input
            label="Email"
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Address"
            value={form.address}
            onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
          />
          <Button title={editing ? 'Save changes' : 'Add customer'} onPress={save} loading={saving} />
        </View>
      </Modal>

      {toast ? (
        <Toast visible={!!toast} message={toast.message} type={toast.type} onHide={() => setToast(null)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 26,
    color: colors.text,
  },
  addBtn: {
    minWidth: 80,
    paddingHorizontal: spacing.md,
  },
  search: {
    marginBottom: spacing.sm,
  },
  row: {
    marginBottom: spacing.sm,
  },
  name: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  empty: {
    textAlign: 'center',
    fontFamily: font.regular,
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
    marginBottom: spacing.md,
  },
});
