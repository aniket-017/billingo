/** Row tolerance in pixels — lines within this vertical distance are treated as one invoice row. */
const ROW_TOLERANCE_PX = 18;

type TextFrame = { top: number; left: number };
type TextLine = { text: string; frame: TextFrame };
type TextBlock = { text: string; lines: TextLine[] };

export type InvoiceOcrResult = {
  text: string;
  blocks: TextBlock[];
};

function collectLines(result: InvoiceOcrResult): TextLine[] {
  const lines: TextLine[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const trimmed = line.text?.trim();
      if (trimmed) lines.push({ text: trimmed, frame: line.frame });
    }
  }
  return lines;
}

/**
 * Build invoice OCR text in visual reading order (top-to-bottom, left-to-right per row).
 * Never uses result.text — ML Kit's flat text often scrambles tabular invoice rows.
 */
export function extractInvoiceOcrText(result: InvoiceOcrResult): string {
  const lines = collectLines(result);
  if (lines.length === 0) {
    return result.text?.trim() ?? '';
  }

  lines.sort((a, b) => a.frame.top - b.frame.top || a.frame.left - b.frame.left);

  const rows: TextLine[][] = [];
  for (const line of lines) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(line.frame.top - lastRow[0].frame.top) <= ROW_TOLERANCE_PX) {
      lastRow.push(line);
    } else {
      rows.push([line]);
    }
  }

  for (const row of rows) {
    row.sort((a, b) => a.frame.left - b.frame.left);
  }

  return rows.map((row) => row.map((l) => l.text).join(' ')).join('\n');
}
