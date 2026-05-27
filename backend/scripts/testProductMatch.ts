import {
  normalizeProductName,
  previewMatch,
  scoreNamePair,
} from '../src/services/productMatch.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const n1 = normalizeProductName('PARACIP 650 TAB');
const n2 = normalizeProductName('PARACIP-650');
const n3 = normalizeProductName('PARACIP 650 TAB 15\'S');
assert(n1.normalizedKey === n2.normalizedKey, 'PARACIP variants should normalize equally');
assert(n1.normalizedKey === n3.normalizedKey, 'pack suffix should strip');

const scoreSame = scoreNamePair(n1, n2);
assert(scoreSame >= 92, `same product score ${scoreSame} should be >= 92`);

const n500 = normalizeProductName('PARACIP 500');
const scoreDiff = scoreNamePair(n1, n500);
assert(scoreDiff === 0, `different strength should score 0, got ${scoreDiff}`);

const catalog = [
  { id: '1', name: 'PARACIP 650 TAB', nameNormalized: n1.normalizedKey },
];
const preview = previewMatch('PARACIP-650', catalog);
assert(preview.status === 'auto', `expected auto, got ${preview.status}`);
assert(preview.productId === '1', 'should match catalog product');

console.log('productMatch tests passed');
