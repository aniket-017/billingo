import { useCallback, useRef } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from './Button';
import { colors, font, radius, spacing } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FRAME_SIZE = SCREEN_WIDTH * 0.65;

type Props = {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
};

export default function BarcodeScanner({ visible, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef(0);
  const insets = useSafeAreaInsets();

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
      <StatusBar style="light" />
      <View style={styles.container}>
        {!permission?.granted ? (
          <View style={[styles.permissionScreen, { paddingTop: insets.top + 20 }]}>
            <Pressable style={[styles.backBtn, { top: insets.top + 12 }]} onPress={onClose}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.permissionContent}>
              <View style={styles.permissionIconWrap}>
                <Ionicons name="camera-outline" size={48} color={colors.primary[600]} />
              </View>
              <Text style={styles.permissionTitle}>Camera Permission</Text>
              <Text style={styles.permissionMsg}>
                We need camera access to scan barcodes and QR codes on products.
              </Text>
              <Button title="Allow camera access" onPress={requestPermission} />
              <Button
                title="Go back"
                variant="ghost"
                onPress={onClose}
                style={{ marginTop: spacing.sm }}
              />
            </View>
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

            {/* Top bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="arrow-back" size={22} color={colors.white} />
              </Pressable>
              <Text style={styles.topTitle}>Scan Product</Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Scan frame overlay */}
            <View style={styles.frameContainer} pointerEvents="none">
              <View style={styles.frame}>
                {/* Corner accents */}
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>

            {/* Bottom panel */}
            <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.bottomContent}>
                <View style={styles.hintRow}>
                  <Ionicons name="scan-outline" size={20} color={colors.primary[500]} />
                  <Text style={styles.hintText}>
                    Point camera at barcode or QR code
                  </Text>
                </View>
                <Text style={styles.hintSub}>
                  Supports EAN, UPC, Code 128, Code 39, and QR codes
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8 }]}
                onPress={onClose}>
                <Text style={styles.cancelText}>Close scanner</Text>
              </Pressable>
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

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: font.semiBold,
    fontSize: 17,
    color: colors.white,
  },

  frameContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.primary[500],
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },

  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 16,
  },
  bottomContent: {
    alignItems: 'center',
    gap: 6,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintText: {
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.white,
  },
  hintSub: {
    fontFamily: font.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
  },
  cancelText: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.white,
  },

  permissionScreen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  backBtn: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: 12,
  },
  permissionIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  permissionTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
  },
  permissionMsg: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
});
