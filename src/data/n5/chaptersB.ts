import type { Kanji } from "./types";

// Chapters 4–6: adjectives & colors, actions, the world
export const chaptersB: Kanji[] = [
  // ---- Chapter 4: Adjectives & colors ----
  { c: "大", m: "big", on: "ダイ, タイ", kun: "おお(きい)", rad: "大 (big)", mn: "A person stretching arms wide — big!", strokes: 3, ch: 4, vocab: [
    { w: "大きい", r: "ookii", m: "big" }, { w: "大学", r: "daigaku", m: "university" }] },
  { c: "小", m: "small", on: "ショウ", kun: "ちい(さい), こ", rad: "小 (small)", mn: "A big shape split into little drops — small.", strokes: 3, ch: 4, vocab: [
    { w: "小さい", r: "chiisai", m: "small" }, { w: "小学校", r: "shougakkou", m: "elementary school" }] },
  { c: "高", m: "tall; expensive", on: "コウ", kun: "たか(い)", rad: "高 (tall)", mn: "A tower with a roof and windows — tall, and pricey to climb.", strokes: 10, ch: 4, vocab: [
    { w: "高い", r: "takai", m: "tall; expensive" }, { w: "高校", r: "koukou", m: "high school" }] },
  { c: "安", m: "cheap; peaceful", on: "アン", kun: "やす(い)", rad: "宀 (roof)", mn: "A woman (女) safe under a roof (宀) — peace of mind, low prices.", strokes: 6, ch: 4, vocab: [
    { w: "安い", r: "yasui", m: "cheap" }, { w: "安心", r: "anshin", m: "relief; peace of mind" }] },
  { c: "新", m: "new", on: "シン", kun: "あたら(しい)", rad: "斤 (axe)", mn: "Fresh wood cut by an axe (斤) — brand new.", strokes: 13, ch: 4, vocab: [
    { w: "新しい", r: "atarashii", m: "new" }, { w: "新聞", r: "shinbun", m: "newspaper" }] },
  { c: "古", m: "old", on: "コ", kun: "ふる(い)", rad: "口 (mouth)", mn: "Ten (十) mouths (口) have told this story — it's old.", strokes: 5, ch: 4, vocab: [
    { w: "古い", r: "furui", m: "old" }, { w: "中古", r: "chuuko", m: "secondhand" }] },
  { c: "長", m: "long; chief", on: "チョウ", kun: "なが(い)", rad: "長 (long)", mn: "Flowing hair down the back — long.", strokes: 8, ch: 4, vocab: [
    { w: "長い", r: "nagai", m: "long" }, { w: "社長", r: "shachou", m: "company president" }] },
  { c: "多", m: "many", on: "タ", kun: "おお(い)", rad: "夕 (evening)", mn: "Two evenings (夕) stacked — too many nights, many.", strokes: 6, ch: 4, vocab: [
    { w: "多い", r: "ooi", m: "many" }, { w: "多分", r: "tabun", m: "probably" }] },
  { c: "少", m: "few; little", on: "ショウ", kun: "すく(ない), すこ(し)", rad: "小 (small)", mn: "Small (小) with a slash taken away — even less: few.", strokes: 4, ch: 4, vocab: [
    { w: "少ない", r: "sukunai", m: "few" }, { w: "少し", r: "sukoshi", m: "a little" }] },
  { c: "早", m: "early; fast", on: "ソウ", kun: "はや(い)", rad: "日 (sun)", mn: "The sun (日) pinned up at ten (十) — early riser.", strokes: 6, ch: 4, vocab: [
    { w: "早い", r: "hayai", m: "early; fast" }, { w: "早朝", r: "souchou", m: "early morning" }] },
  { c: "白", m: "white", on: "ハク", kun: "しろ(い)", rad: "白 (white)", mn: "The sun (日) with a ray of light on top — bright white.", strokes: 5, ch: 4, vocab: [
    { w: "白い", r: "shiroi", m: "white" }, { w: "面白い", r: "omoshiroi", m: "interesting" }] },
  { c: "赤", m: "red", on: "セキ", kun: "あか(い)", rad: "赤 (red)", mn: "Earth (土) over flames — glowing red.", strokes: 7, ch: 4, vocab: [
    { w: "赤い", r: "akai", m: "red" }, { w: "赤ちゃん", r: "akachan", m: "baby" }] },
  { c: "青", m: "blue", on: "セイ, ショウ", kun: "あお(い)", rad: "青 (blue)", mn: "Fresh plants over the moon's well — deep blue-green.", strokes: 8, ch: 4, vocab: [
    { w: "青い", r: "aoi", m: "blue" }, { w: "青空", r: "aozora", m: "blue sky" }] },
  { c: "黒", m: "black", on: "コク", kun: "くろ(い)", rad: "黒 (black)", mn: "A field (田) scorched by fire — charred black.", strokes: 11, ch: 4, vocab: [
    { w: "黒い", r: "kuroi", m: "black" }, { w: "黒板", r: "kokuban", m: "blackboard" }] },
  { c: "間", m: "between; interval", on: "カン, ケン", kun: "あいだ", rad: "門 (gate)", mn: "The sun (日) seen through a gate (門) — the space between.", strokes: 12, ch: 4, vocab: [
    { w: "間", r: "aida", m: "between" }, { w: "時間", r: "jikan", m: "time" }] },
  { c: "何", m: "what", on: "カ", kun: "なに, なん", rad: "人 (person)", mn: "A person (亻) with a hook of doubt — what?", strokes: 7, ch: 4, vocab: [
    { w: "何", r: "nani", m: "what" }, { w: "何曜日", r: "nanyoubi", m: "what day of the week" }] },

  // ---- Chapter 5: Actions ----
  { c: "見", m: "to see", on: "ケン", kun: "み(る)", rad: "見 (see)", mn: "An eye (目) on legs — seeing walks around.", strokes: 7, ch: 5, vocab: [
    { w: "見る", r: "miru", m: "to see" }, { w: "意見", r: "iken", m: "opinion" }] },
  { c: "聞", m: "to hear; to ask", on: "ブン, モン", kun: "き(く)", rad: "耳 (ear)", mn: "An ear (耳) at the gate (門) — listening, asking.", strokes: 14, ch: 5, vocab: [
    { w: "聞く", r: "kiku", m: "to listen; to ask" }, { w: "新聞", r: "shinbun", m: "newspaper" }] },
  { c: "読", m: "to read", on: "ドク", kun: "よ(む)", rad: "言 (speech)", mn: "Words (言) sold aloud — reading.", strokes: 14, ch: 5, vocab: [
    { w: "読む", r: "yomu", m: "to read" }, { w: "読書", r: "dokusho", m: "reading (books)" }] },
  { c: "書", m: "to write", on: "ショ", kun: "か(く)", rad: "曰 (say)", mn: "A brush marking the sun — writing.", strokes: 10, ch: 5, vocab: [
    { w: "書く", r: "kaku", m: "to write" }, { w: "辞書", r: "jisho", m: "dictionary" }] },
  { c: "話", m: "to speak; story", on: "ワ", kun: "はな(す), はなし", rad: "言 (speech)", mn: "Words (言) from the tongue (舌) — speaking.", strokes: 13, ch: 5, vocab: [
    { w: "話す", r: "hanasu", m: "to speak" }, { w: "電話", r: "denwa", m: "telephone" }] },
  { c: "言", m: "to say", on: "ゲン, ゴン", kun: "い(う)", rad: "言 (speech)", mn: "Sound waves over a mouth — to say.", strokes: 7, ch: 5, vocab: [
    { w: "言う", r: "iu", m: "to say" }, { w: "言葉", r: "kotoba", m: "word; language" }] },
  { c: "食", m: "to eat", on: "ショク", kun: "た(べる)", rad: "食 (eat)", mn: "A roof over a rice bowl — eating.", strokes: 9, ch: 5, vocab: [
    { w: "食べる", r: "taberu", m: "to eat" }, { w: "食事", r: "shokuji", m: "meal" }] },
  { c: "飲", m: "to drink", on: "イン", kun: "の(む)", rad: "食 (eat)", mn: "Food radical with a yawning mouth — drinking.", strokes: 12, ch: 5, vocab: [
    { w: "飲む", r: "nomu", m: "to drink" }, { w: "飲み物", r: "nomimono", m: "a drink" }] },
  { c: "行", m: "to go", on: "コウ, ギョウ", kun: "い(く), おこな(う)", rad: "行 (go)", mn: "Crossroads with a stride — going.", strokes: 6, ch: 5, vocab: [
    { w: "行く", r: "iku", m: "to go" }, { w: "銀行", r: "ginkou", m: "bank" }] },
  { c: "来", m: "to come", on: "ライ", kun: "く(る)", rad: "木 (tree)", mn: "A tree with people arriving under it — coming.", strokes: 7, ch: 5, vocab: [
    { w: "来る", r: "kuru", m: "to come" }, { w: "来週", r: "raishuu", m: "next week" }] },
  { c: "帰", m: "to return", on: "キ", kun: "かえ(る)", rad: "巾 (cloth)", mn: "A broom sweeping you back home — returning.", strokes: 10, ch: 5, vocab: [
    { w: "帰る", r: "kaeru", m: "to return home" }, { w: "帰国", r: "kikoku", m: "returning to one's country" }] },
  { c: "入", m: "to enter", on: "ニュウ", kun: "い(る), はい(る)", rad: "入 (enter)", mn: "A stroke sliding under the gate — entering.", strokes: 2, ch: 5, vocab: [
    { w: "入る", r: "hairu", m: "to enter" }, { w: "入学", r: "nyuugaku", m: "school admission" }] },
  { c: "出", m: "to exit; to put out", on: "シュツ", kun: "で(る), だ(す)", rad: "凵 (container)", mn: "A sprout pushing out of the ground — exiting.", strokes: 5, ch: 5, vocab: [
    { w: "出る", r: "deru", m: "to leave" }, { w: "出口", r: "deguchi", m: "exit" }] },
  { c: "立", m: "to stand", on: "リツ", kun: "た(つ)", rad: "立 (stand)", mn: "A person planted firmly on the ground — standing.", strokes: 5, ch: 5, vocab: [
    { w: "立つ", r: "tatsu", m: "to stand" }, { w: "国立", r: "kokuritsu", m: "national" }] },
  { c: "休", m: "to rest", on: "キュウ", kun: "やす(む)", rad: "人 (person)", mn: "A person (亻) leaning on a tree (木) — resting.", strokes: 6, ch: 5, vocab: [
    { w: "休む", r: "yasumu", m: "to rest" }, { w: "休日", r: "kyuujitsu", m: "holiday" }] },
  { c: "買", m: "to buy", on: "バイ", kun: "か(う)", rad: "貝 (shell/money)", mn: "A net over shell money (貝) — buying.", strokes: 12, ch: 5, vocab: [
    { w: "買う", r: "kau", m: "to buy" }, { w: "買い物", r: "kaimono", m: "shopping" }] },

  // ---- Chapter 6: The world ----
  { c: "学", m: "to learn", on: "ガク", kun: "まな(ぶ)", rad: "子 (child)", mn: "A child (子) under a roof of knowledge — learning.", strokes: 8, ch: 6, vocab: [
    { w: "学ぶ", r: "manabu", m: "to learn" }, { w: "学校", r: "gakkou", m: "school" }] },
  { c: "校", m: "school", on: "コウ", kun: "—", rad: "木 (tree)", mn: "A tree (木) where paths cross (交) — school.", strokes: 10, ch: 6, vocab: [
    { w: "学校", r: "gakkou", m: "school" }, { w: "高校", r: "koukou", m: "high school" }] },
  { c: "生", m: "life; to be born", on: "セイ, ショウ", kun: "い(きる), う(まれる)", rad: "生 (life)", mn: "A sprout breaking through the soil — life, birth.", strokes: 5, ch: 6, vocab: [
    { w: "学生", r: "gakusei", m: "student" }, { w: "生まれる", r: "umareru", m: "to be born" }] },
  { c: "国", m: "country", on: "コク", kun: "くに", rad: "囗 (enclosure)", mn: "A jewel (玉) inside borders (囗) — a country.", strokes: 8, ch: 6, vocab: [
    { w: "国", r: "kuni", m: "country" }, { w: "外国", r: "gaikoku", m: "foreign country" }] },
  { c: "語", m: "language", on: "ゴ", kun: "かた(る)", rad: "言 (speech)", mn: "Words (言) from five mouths — language.", strokes: 14, ch: 6, vocab: [
    { w: "日本語", r: "nihongo", m: "Japanese language" }, { w: "英語", r: "eigo", m: "English language" }] },
  { c: "電", m: "electricity", on: "デン", kun: "—", rad: "雨 (rain)", mn: "Lightning under the rain cloud — electricity.", strokes: 13, ch: 6, vocab: [
    { w: "電話", r: "denwa", m: "telephone" }, { w: "電車", r: "densha", m: "train" }] },
  { c: "車", m: "car; vehicle", on: "シャ", kun: "くるま", rad: "車 (cart)", mn: "A cart seen from above: wheels and axle — vehicle.", strokes: 7, ch: 6, vocab: [
    { w: "車", r: "kuruma", m: "car" }, { w: "電車", r: "densha", m: "train" }] },
  { c: "駅", m: "station", on: "エキ", kun: "—", rad: "馬 (horse)", mn: "The horse (馬) relay post of old roads — the station.", strokes: 14, ch: 6, vocab: [
    { w: "駅", r: "eki", m: "station" }, { w: "駅前", r: "ekimae", m: "in front of the station" }] },
  { c: "店", m: "shop", on: "テン", kun: "みせ", rad: "广 (shelter)", mn: "A fortune-teller's stall under a roof — a shop.", strokes: 8, ch: 6, vocab: [
    { w: "店", r: "mise", m: "shop" }, { w: "店員", r: "ten'in", m: "shop clerk" }] },
  { c: "天", m: "sky; heaven", on: "テン", kun: "あめ", rad: "大 (big)", mn: "The big (大) sky above everything — heaven.", strokes: 4, ch: 6, vocab: [
    { w: "天気", r: "tenki", m: "weather" }, { w: "天国", r: "tengoku", m: "heaven" }] },
  { c: "気", m: "spirit; energy", on: "キ, ケ", kun: "—", rad: "气 (steam)", mn: "Steam rising with hidden force — spirit, energy.", strokes: 6, ch: 6, vocab: [
    { w: "元気", r: "genki", m: "healthy; energetic" }, { w: "天気", r: "tenki", m: "weather" }] },
  { c: "雨", m: "rain", on: "ウ", kun: "あめ", rad: "雨 (rain)", mn: "Drops falling from a cloud in a window — rain.", strokes: 8, ch: 6, vocab: [
    { w: "雨", r: "ame", m: "rain" }, { w: "大雨", r: "ooame", m: "heavy rain" }] },
  { c: "山", m: "mountain", on: "サン", kun: "やま", rad: "山 (mountain)", mn: "Three peaks rising — a mountain.", strokes: 3, ch: 6, vocab: [
    { w: "山", r: "yama", m: "mountain" }, { w: "富士山", r: "fujisan", m: "Mt. Fuji" }] },
  { c: "川", m: "river", on: "セン", kun: "かわ", rad: "川 (river)", mn: "Three streams flowing side by side — a river.", strokes: 3, ch: 6, vocab: [
    { w: "川", r: "kawa", m: "river" }, { w: "河川", r: "kasen", m: "rivers" }] },
  { c: "目", m: "eye", on: "モク", kun: "め", rad: "目 (eye)", mn: "An eye turned sideways — 目.", strokes: 5, ch: 6, vocab: [
    { w: "目", r: "me", m: "eye" }, { w: "目的", r: "mokuteki", m: "purpose" }] },
  { c: "耳", m: "ear", on: "ジ", kun: "みみ", rad: "耳 (ear)", mn: "The folds of an ear, mapped in strokes — ear.", strokes: 6, ch: 6, vocab: [
    { w: "耳", r: "mimi", m: "ear" }, { w: "耳鳴り", r: "miminari", m: "ringing in the ears" }] },
];
