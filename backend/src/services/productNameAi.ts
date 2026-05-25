import { extractProductNameWithDeepSeek, isDeepSeekConfigured } from './deepseek.js';
import { extractProductNameWithGemini, isGeminiConfigured } from './gemini.js';
import { getProductNameAiProvider } from './productNameAiShared.js';

export function isProductNameAiConfigured(): boolean {
  try {
    const provider = getProductNameAiProvider();
    return provider === 'google' ? isGeminiConfigured() : isDeepSeekConfigured();
  } catch {
    return false;
  }
}

export async function extractProductNameFromLabelText(ocrText: string): Promise<string> {
  const provider = getProductNameAiProvider();

  if (provider === 'google') {
    if (!isGeminiConfigured()) {
      throw new Error('AI_NOT_CONFIGURED');
    }
    return extractProductNameWithGemini(ocrText);
  }

  if (!isDeepSeekConfigured()) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  return extractProductNameWithDeepSeek(ocrText);
}
