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

function collectLines(result: OcrResult): TextLine[] {
  const lines: TextLine[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      if (line.text?.trim()) lines.push(line);
    }
  }
  return lines;
}

/** All text from the label image (top-to-bottom), for manual editing in the name field. */
export function extractFullLabelText(result: OcrResult): string {
  const full = result.text?.trim();
  if (full) return full;

  const lines = collectLines(result);
  if (lines.length === 0) return '';

  lines.sort((a, b) => a.frame.top - b.frame.top || a.frame.left - b.frame.left);
  return lines.map((line) => line.text.trim()).join('\n');
}
