import { cleanModelOutput, PRODUCT_NAME_SYSTEM_PROMPT } from './productNameAiShared.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_BASE_URL = (
  process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
).replace(/\/$/, '');

type GeminiGenerateContentResponse = {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
  error?: { message?: string };
};

export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY?.trim());
}

export async function extractProductNameWithGemini(ocrText: string): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error('GEMINI_NOT_CONFIGURED');
  }

  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: PRODUCT_NAME_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: ocrText }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
      },
    }),
  });

  const data = (await res.json()) as GeminiGenerateContentResponse;
  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'Gemini request failed';
    throw new Error(`Gemini: ${msg}`);
  }

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content?.trim()) {
    throw new Error('Gemini returned an empty product name');
  }

  return cleanModelOutput(content);
}
