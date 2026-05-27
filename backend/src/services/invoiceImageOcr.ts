import Tesseract from 'tesseract.js';

export async function ocrInvoiceImageBuffer(buffer: Buffer): Promise<string> {
  const { data } = await Tesseract.recognize(buffer, 'eng', {
    logger: () => {},
  });
  return data.text.replace(/\r\n/g, '\n').trim();
}
