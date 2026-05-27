import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductMatchCandidate } from '@/src/api/client';
import Button from '@/src/components/Button';
import { colors, font, radius, spacing } from '@/src/theme';

type Props = {
  visible: boolean;
  invoiceName: string;
  candidates: ProductMatchCandidate[];
  onSelect: (productId: string, productName: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
};

export default function ProductMatchPicker({
  visible,
  invoiceName,
  candidates,
  onSelect,
  onCreateNew,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.header}>
          <Text style={st.title}>Match product</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={st.invoiceName} numberOfLines={2}>
          Invoice: {invoiceName}
        </Text>
        <Text style={st.hint}>Choose an existing product or create as new.</Text>
        <ScrollView style={st.list} keyboardShouldPersistTaps="handled">
          {candidates.map((c) => (
            <Pressable
              key={c.id}
              style={st.candidate}
              onPress={() => onSelect(c.id, c.name)}
            >
              <View style={st.candidateBody}>
                <Text style={st.candidateName}>{c.name}</Text>
                <Text style={st.candidateScore}>{Math.round(c.score)}% match</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </ScrollView>
        <Button title="Create as new product" variant="secondary" onPress={onCreateNew} />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.bold, fontSize: 18, color: colors.text },
  invoiceName: { marginTop: spacing.sm, fontFamily: font.medium, fontSize: 14, color: colors.text },
  hint: { marginTop: spacing.xs, fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  list: { maxHeight: 280, marginBottom: spacing.md },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface[200],
  },
  candidateBody: { flex: 1 },
  candidateName: { fontFamily: font.semiBold, fontSize: 15, color: colors.text },
  candidateScore: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
