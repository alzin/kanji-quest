/** One ruby span of a word: surface text plus the reading it carries. */
export type Furi = { t: string; r?: string };

export type Vocab = {
  w: string; // the word
  r: string; // wapuro romaji
  m: string; // english meaning
  f: Furi[]; // per-character readings; f.map(t).join("") === w
};

export type Kanji = {
  c: string; // the kanji character
  m: string; // english meaning(s)
  on: string; // on'yomi (katakana)
  kun: string; // kun'yomi (hiragana)
  rad: string; // main radical
  mn: string; // mnemonic
  strokes: number;
  ch: number; // permanent region ID: N5 1–6, N4 7–12
  vocab: Vocab[]; // 2 words using this kanji
};
