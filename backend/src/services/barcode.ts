import bwipjs from 'bwip-js';
// just testing

export async function generateBarcodeImage(barcode: string): Promise<Buffer> {
  return await bwipjs.toBuffer({
    bcid: 'code128',
    text: barcode,
    scale: 2,
    height: 10,
    includetext: true,
  });
}
