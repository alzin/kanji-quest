import type { Kanji } from "./n5/types";

export type JLPTLevel = "N5" | "N4";
export const LEVELS: readonly JLPTLevel[] = ["N5", "N4"];
export const CURRICULUM_VERSION = 2;

type Region = { id: number; legacyChapter: number; level: JLPTLevel; name: string; jp: string; chars: string };
type Stop = [id: number, name: string, jp: string, chars: string];
const group = (legacyChapter: number, level: JLPTLevel, stops: Stop[]): Region[] =>
  stops.map(([id, name, jp, chars]) => ({ id, legacyChapter, level, name, jp, chars }));

// Explicit IDs are save/link identifiers. Array order, not ID arithmetic, defines the road.
// Each original theme is divided into small vocabulary families, keeping all card content.
export const REGIONS: readonly Region[] = [
  ...group(1, "N5", [
    [1, "The First Five", "一から五", "一二三四五"],
    [13, "Counting to Ten", "十までの道", "六七八九十"],
    [14, "Numbers Around You", "暮らしの数", "百千万円時分"],
  ]),
  ...group(2, "N5", [
    [2, "Days & Nature", "日々と自然", "日月火水木"],
    [15, "The Calendar Path", "暦の道", "金土曜年週"],
    [16, "Daily Moments", "毎日の時間", "半今先毎朝昼"],
  ]),
  ...group(3, "N5", [
    [3, "Everyday Encounters", "出会いの広場", "人友名前夜"],
    [17, "The Family Circle", "家族の輪", "男女子父母"],
    [18, "Finding Your Place", "場所を探そう", "後右左中上下"],
  ]),
  ...group(4, "N5", [
    [4, "Shapes & Sizes", "大きさと長さ", "大小長間"],
    [19, "Amounts & Prices", "数と値段", "高安多少"],
    [20, "Everyday Descriptions", "暮らしの言葉", "新古早何"],
    [21, "Four Colors", "四つの色", "白赤青黒"],
  ]),
  ...group(5, "N5", [
    [5, "Words & Conversation", "言葉の広場", "見聞読書話言"],
    [22, "A Daily Break", "ひと休み", "食飲買立休"],
    [23, "Coming & Going", "行き来の道", "行来帰入出"],
  ]),
  ...group(6, "N5", [
    [6, "Learning with Your Senses", "見て聞いて学ぼう", "学校生語目耳"],
    [24, "Around Town", "町を歩こう", "国電車駅店"],
    [25, "Sky, Mountains & Rivers", "空と山と川", "天気雨山川"],
  ]),
  ...group(7, "N4", [
    [7, "Me & My Neighborhood", "私と近所", "本外社私自会"],
    [26, "Brothers, Sisters & Parents", "家族のつながり", "族親兄姉弟妹"],
    [27, "A Place to Call Home", "住まいの言葉", "家主住所屋室"],
    [28, "Getting Dressed & Going Out", "出かける支度", "門開服着物品"],
    [29, "Getting Along", "人とのつながり", "同合別方心好"],
    [30, "Everyday Essentials", "暮らしの基本", "便不有手足口"],
  ]),
  ...group(8, "N4", [
    [8, "Letters & Languages", "文字と言語", "文字漢英紙"],
    [31, "Study & Practice", "学習と練習", "教習勉強試験"],
    [32, "Questions & Thoughts", "問いと考え", "質問題答考思"],
    [33, "Meaning & Explanation", "意味と説明", "意知理正説"],
    [34, "Plans & Research", "計画と研究", "計研究図用"],
    [35, "Ideas in Everyday Words", "言葉を広げよう", "代以特真元"],
  ]),
  ...group(9, "N4", [
    [9, "Compass & Capitals", "方角と都", "北南東西京都"],
    [36, "Towns & Districts", "町と地域", "県市区町村地"],
    [37, "Paths Through Town", "町の道", "公場道通走歩"],
    [38, "All Aboard", "乗り物で出発", "乗運転発進急"],
    [39, "Near & Far", "近くへ遠くへ", "空近遠旅送"],
    [40, "Building Our World", "世界をつくる", "建工台世界"],
  ]),
  ...group(10, "N4", [
    [10, "At Work", "仕事の時間", "仕事働作業"],
    [41, "Handling Daily Tasks", "毎日の用事", "持待使引切"],
    [42, "Starting & Stopping", "動きの流れ", "始終止動去"],
    [43, "Buying, Selling & Borrowing", "お店のやりとり", "借貸売銀産"],
    [44, "The Lunch Stop", "昼ご飯の時間", "肉魚午注回"],
    [45, "People & Occasions", "人が集まる場所", "集員民度"],
  ]),
  ...group(11, "N4", [
    [11, "The Four Seasons", "四季の庭", "春夏秋冬夕"],
    [46, "Water & Woodlands", "水辺と森", "海池森林洋"],
    [47, "Fields & Animals", "野原の生き物", "田野犬鳥牛"],
    [48, "At the Table", "食卓の言葉", "菜飯味料茶"],
    [49, "Nature's Colors & Sounds", "自然の色と音", "花光風色音"],
    [50, "Music, Pictures & Film", "音楽と映画", "写楽歌映画館"],
  ]),
  ...group(12, "N4", [
    [12, "Body & Voice", "体と声", "体顔頭声首"],
    [51, "A Visit to the Doctor", "病院へ", "医者病院薬"],
    [52, "Health & Strength", "体の調子", "力弱悪死"],
    [53, "Waking Up", "朝の支度", "起洗明暗"],
    [54, "Weight & Weather", "重さと気温", "軽重暑寒"],
    [55, "Describing Spaces", "広さと形", "広太短低堂"],
  ]),
];

export const LEVEL_CHAPTERS: Record<JLPTLevel, readonly number[]> = {
  N5: REGIONS.filter((r) => r.level === "N5").map((r) => r.id),
  N4: REGIONS.filter((r) => r.level === "N4").map((r) => r.id),
};
export const CHAPTER_NAMES: Record<number, { name: string; jp: string }> = Object.fromEntries(
  REGIONS.map((r) => [r.id, { name: r.name, jp: r.jp }]),
);
export const CHAPTER_COUNT = REGIONS.length;
export const LEGACY_CHAPTERS = Array.from({ length: 12 }, (_, i) => i + 1);

export function levelOfChapter(ch: number): JLPTLevel | undefined {
  return REGIONS.find((r) => r.id === ch)?.level;
}

export function nextChapter(ch: number): number | undefined {
  const level = levelOfChapter(ch);
  if (!level) return undefined;
  const road = LEVEL_CHAPTERS[level];
  return road[road.indexOf(ch) + 1];
}

/** Reuse character keys and vocabulary; only the study order and region change. */
export function arrangeRegions(cards: Kanji[], level: JLPTLevel): Kanji[] {
  const byChar = new Map(cards.map((k) => [k.c, k]));
  const arranged = REGIONS.filter((r) => r.level === level).flatMap((r) => [...r.chars].map((c) => {
    const original = byChar.get(c);
    if (!original || original.ch !== r.legacyChapter) throw new Error(`Invalid region assignment: ${c}`);
    return { ...original, ch: r.id };
  }));
  if (arranged.length !== cards.length || new Set(arranged.map((k) => k.c)).size !== cards.length) {
    throw new Error(`Incomplete ${level} region coverage`);
  }
  return arranged;
}
