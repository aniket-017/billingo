import { cleanModelOutput, PRODUCT_NAME_SYSTEM_PROMPT } from './productNameAiShared.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL;
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(
  /\/$/,
  ''
);

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

export function isDeepSeekConfigured(): boolean {
  return Boolean(DEEPSEEK_API_KEY?.trim());
}

export async function extractProductNameWithDeepSeek(ocrText: string): Promise<string> {
  if (!isDeepSeekConfigured()) {
    throw new Error('DEEPSEEK_NOT_CONFIGURED');
  }

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: PRODUCT_NAME_SYSTEM_PROMPT },
        { role: 'user', content: ocrText },
      ],
      stream: false,
      temperature: 0.2,
      max_tokens: 256,
    }),
  });

  const data = (await res.json()) as ChatCompletionResponse;
  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'DeepSeek request failed';
    throw new Error(`DeepSeek: ${msg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error('DeepSeek returned an empty product name');
  }

  return cleanModelOutput(content);
}
