import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { api } from '@/src/api/client';
import { extractFullLabelText, type OcrResult } from '@/src/utils/extractProductName';

export function useProductNameOcr() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const scanLabelForName = useCallback(async (): Promise<string | null> => {
    setError(null);
    setWarning(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to scan product labels');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return null;
    }

    setLoading(true);
    try {
      const ocr = (await recognizeText(result.assets[0].uri)) as OcrResult;
      const fullText = extractFullLabelText(ocr);
      if (!fullText) {
        setError('Could not read any text on the label. Enter the name manually.');
        return null;
      }

      try {
        const { name } = await api.products.extractNameFromOcr(fullText);
        if (!name.trim()) {
          setWarning('AI name extraction failed — using full label text');
          return fullText;
        }
        return name.trim();
      } catch {
        setWarning('AI name extraction failed — using full label text');
        return fullText;
      }
    } catch {
      setError('OCR is unavailable. Use a dev build or enter the name manually.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    scanLabelForName,
    loading,
    error,
    warning,
    clearError: () => setError(null),
    clearWarning: () => setWarning(null),
  };
}
