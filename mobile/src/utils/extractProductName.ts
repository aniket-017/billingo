type TextFrame = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type TextLine = {
  text: string;
  frame: TextFrame;
};

type TextBlock = {
  text: string;
  lines: TextLine[];
};

export type OcrResult = {
  text: string;
  blocks: TextBlock[];
};

function lineHeight(frame: TextFrame): number {
  return Math.max(0, frame.bottom - frame.top);
}

function isMostlyDigits(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/[^\d]/g, '').length;
  return digits / trimmed.length > 0.7;
}

function isNoiseLine(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;
  const upper = trimmed.toUpperCase();
  if (/^(MRP|RS\.?|₹|INR|NET\s*WT|NET\s*W|T\.?C\.?|BATCH|EXP|MFG|LOT|PKD|PACKED|BEST\s*BEFORE)/.test(upper)) {
    return true;
  }
  if (/^\d[\d\s\-./]*$/.test(trimmed)) return true;
  if (/^[A-Z0-9]{8,}$/.test(trimmed.replace(/\s/g, ''))) return true;
  return false;
}

function collectLines(result: OcrResult): TextLine[] {
  const lines: TextLine[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      if (line.text?.trim()) lines.push(line);
    }
  }
  return lines;
}

/** Pick the most likely product title from ML Kit OCR output. */
export function extractProductName(result: OcrResult): string {
  const candidates = collectLines(result).filter((line) => {
    const text = line.text.trim();
    return text.length >= 3 && !isNoiseLine(text) && !isMostlyDigits(text);
  });

  if (candidates.length === 0) {
    const fallback = collectLines(result)
      .map((line) => line.text.trim())
      .find((text) => text.length >= 3);
    return fallback ?? '';
  }

  candidates.sort((a, b) => lineHeight(b.frame) - lineHeight(a.frame));
  return candidates[0].text.trim();
}
