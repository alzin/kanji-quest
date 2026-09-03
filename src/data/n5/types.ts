export type Vocab = { w: string; r: string; m: string };

export type Kanji = {
  c: string; // the kanji character
  m: string; // english meaning(s)
  on: string; // on'yomi (katakana)
  kun: string; // kun'yomi (hiragana)
  rad: string; // main radical
  mn: string; // mnemonic
  strokes: number;
  ch: number; // chapter (region) 1-6
  vocab: Vocab[]; // 2 words using this kanji
};
