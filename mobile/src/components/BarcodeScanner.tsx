import { useCallback, useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Button from './Button';
import { colors, font, radius, spacing } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
};

export default function BarcodeScanner({ visible, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef(0);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (now - lastScanRef.current < 500) return;
      lastScanRef.current = now;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onScan(data);
    },
    [onScan]
  );

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission?.granted ? (
          <View style={styles.center}>
            <Text style={styles.message}>Camera access is needed to scan barcodes.</Text>
            <Button title="Allow camera" onPress={requestPermission} />
            <Button title="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: spacing.sm }} />
          </View>
        ) : (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
              }}
              onBarcodeScanned={handleScan}
            />
            <View style={styles.overlay}>
              <Text style={styles.hint}>Point camera at barcode</Text>
              <Button title="Close scanner" variant="secondary" onPress={onClose} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: spacing.md,
  },
  hint: {
    color: colors.white,
    fontFamily: font.medium,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface[50],
  },
  message: {
    fontFamily: font.regular,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
