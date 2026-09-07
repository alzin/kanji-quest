import type { Kanji } from "./types";

// Chapters 1–3: numbers & time, days & people, positions
export const chaptersA: Kanji[] = [
  // ---- Chapter 1: Numbers & time basics ----
  { c: "一", m: "one", on: "イチ, イツ", kun: "ひと(つ)", rad: "一 (one)", mn: "A single horizontal stroke — the number one.", strokes: 1, ch: 1, vocab: [
    { w: "一つ", r: "hitotsu", m: "one (thing)", f: [{ t: "一", r: "ひと" }, { t: "つ" }] },
    { w: "一人", r: "hitori", m: "one person", f: [{ t: "一", r: "ひと" }, { t: "人", r: "り" }] },
  ] },
  { c: "二", m: "two", on: "ニ", kun: "ふた(つ)", rad: "二 (two)", mn: "Two parallel lines — count them: one, two.", strokes: 2, ch: 1, vocab: [
    { w: "二つ", r: "futatsu", m: "two (things)", f: [{ t: "二", r: "ふた" }, { t: "つ" }] },
    { w: "二人", r: "futari", m: "two people", f: [{ t: "二", r: "ふた" }, { t: "人", r: "り" }] },
  ] },
  { c: "三", m: "three", on: "サン", kun: "みっ(つ)", rad: "一 (one)", mn: "Three stacked lines — one, two, three.", strokes: 3, ch: 1, vocab: [
    { w: "三つ", r: "mittsu", m: "three (things)", f: [{ t: "三", r: "みっ" }, { t: "つ" }] },
    { w: "三月", r: "sangatsu", m: "March", f: [{ t: "三", r: "さん" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "四", m: "four", on: "シ", kun: "よ(ん), よっ(つ)", rad: "囗 (enclosure)", mn: "A box with two legs inside — a square has four sides.", strokes: 5, ch: 1, vocab: [
    { w: "四つ", r: "yottsu", m: "four (things)", f: [{ t: "四", r: "よっ" }, { t: "つ" }] },
    { w: "四月", r: "shigatsu", m: "April", f: [{ t: "四", r: "し" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "五", m: "five", on: "ゴ", kun: "いつ(つ)", rad: "二 (two)", mn: "Lines crossing to count — a hand holds five fingers.", strokes: 4, ch: 1, vocab: [
    { w: "五つ", r: "itsutsu", m: "five (things)", f: [{ t: "五", r: "いつ" }, { t: "つ" }] },
    { w: "五月", r: "gogatsu", m: "May", f: [{ t: "五", r: "ご" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "六", m: "six", on: "ロク", kun: "むっ(つ)", rad: "八 (eight)", mn: "A hat on a table with two legs — a lucky table for six.", strokes: 4, ch: 1, vocab: [
    { w: "六つ", r: "muttsu", m: "six (things)", f: [{ t: "六", r: "むっ" }, { t: "つ" }] },
    { w: "六月", r: "rokugatsu", m: "June", f: [{ t: "六", r: "ろく" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "七", m: "seven", on: "シチ", kun: "なな(つ)", rad: "一 (one)", mn: "A cross sliced by a hook — lucky number seven.", strokes: 2, ch: 1, vocab: [
    { w: "七つ", r: "nanatsu", m: "seven (things)", f: [{ t: "七", r: "なな" }, { t: "つ" }] },
    { w: "七月", r: "shichigatsu", m: "July", f: [{ t: "七", r: "しち" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "八", m: "eight", on: "ハチ", kun: "やっ(つ)", rad: "八 (eight)", mn: "Two strokes spreading wide — like a mountain road splitting eight ways.", strokes: 2, ch: 1, vocab: [
    { w: "八つ", r: "yattsu", m: "eight (things)", f: [{ t: "八", r: "やっ" }, { t: "つ" }] },
    { w: "八月", r: "hachigatsu", m: "August", f: [{ t: "八", r: "はち" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "九", m: "nine", on: "キュウ, ク", kun: "ここの(つ)", rad: "乙 (second)", mn: "An arm bent at the elbow — nine is almost ten.", strokes: 2, ch: 1, vocab: [
    { w: "九つ", r: "kokonotsu", m: "nine (things)", f: [{ t: "九", r: "ここの" }, { t: "つ" }] },
    { w: "九月", r: "kugatsu", m: "September", f: [{ t: "九", r: "く" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "十", m: "ten", on: "ジュウ", kun: "とお", rad: "十 (ten)", mn: "A perfect cross — ten completes the count.", strokes: 2, ch: 1, vocab: [
    { w: "十", r: "too", m: "ten", f: [{ t: "十", r: "とお" }] },
    { w: "十月", r: "juugatsu", m: "October", f: [{ t: "十", r: "じゅう" }, { t: "月", r: "がつ" }] },
  ] },
  { c: "百", m: "hundred", on: "ヒャク", kun: "—", rad: "白 (white)", mn: "One (一) white (白) — one hundred.", strokes: 6, ch: 1, vocab: [
    { w: "百", r: "hyaku", m: "hundred", f: [{ t: "百", r: "ひゃく" }] },
    { w: "三百", r: "sanbyaku", m: "three hundred", f: [{ t: "三", r: "さん" }, { t: "百", r: "びゃく" }] },
  ] },
  { c: "千", m: "thousand", on: "セン", kun: "ち", rad: "十 (ten)", mn: "Ten (十) with a sweep on top — ten hundreds make a thousand.", strokes: 3, ch: 1, vocab: [
    { w: "千", r: "sen", m: "thousand", f: [{ t: "千", r: "せん" }] },
    { w: "三千", r: "sanzen", m: "three thousand", f: [{ t: "三", r: "さん" }, { t: "千", r: "ぜん" }] },
  ] },
  { c: "万", m: "ten thousand", on: "マン, バン", kun: "—", rad: "一 (one)", mn: "A big sweeping roof — numbers too big for two hands: ten thousand.", strokes: 3, ch: 1, vocab: [
    { w: "一万", r: "ichiman", m: "ten thousand", f: [{ t: "一", r: "いち" }, { t: "万", r: "まん" }] },
    { w: "万年筆", r: "man'nenhitsu", m: "fountain pen", f: [{ t: "万", r: "まん" }, { t: "年", r: "ねん" }, { t: "筆", r: "ひつ" }] },
  ] },
  { c: "円", m: "yen; circle", on: "エン", kun: "まる(い)", rad: "冂 (border)", mn: "A coin in a frame — the round yen.", strokes: 4, ch: 1, vocab: [
    { w: "百円", r: "hyakuen", m: "100 yen", f: [{ t: "百", r: "ひゃく" }, { t: "円", r: "えん" }] },
    { w: "円い", r: "marui", m: "round", f: [{ t: "円", r: "まる" }, { t: "い" }] },
  ] },
  { c: "時", m: "time; hour", on: "ジ", kun: "とき", rad: "日 (sun)", mn: "Sun (日) at the temple (寺) — the temple bell marks the hour.", strokes: 10, ch: 1, vocab: [
    { w: "一時", r: "ichiji", m: "one o'clock", f: [{ t: "一", r: "いち" }, { t: "時", r: "じ" }] },
    { w: "時々", r: "tokidoki", m: "sometimes", f: [{ t: "時", r: "とき" }, { t: "々", r: "どき" }] },
  ] },
  { c: "分", m: "minute; to divide", on: "ブン, フン, プン", kun: "わ(かる)", rad: "刀 (sword)", mn: "Eight (八) cut by a sword (刀) — divided into parts, like minutes.", strokes: 4, ch: 1, vocab: [
    { w: "五分", r: "gofun", m: "five minutes", f: [{ t: "五", r: "ご" }, { t: "分", r: "ふん" }] },
    { w: "分かる", r: "wakaru", m: "to understand", f: [{ t: "分", r: "わ" }, { t: "かる" }] },
  ] },

  // ---- Chapter 2: Days, weeks, seasons ----
  { c: "半", m: "half", on: "ハン", kun: "なか(ば)", rad: "十 (ten)", mn: "Ten split by two horns — sliced in half.", strokes: 5, ch: 2, vocab: [
    { w: "半分", r: "hanbun", m: "half", f: [{ t: "半", r: "はん" }, { t: "分", r: "ぶん" }] },
    { w: "半年", r: "hantoshi", m: "half a year", f: [{ t: "半", r: "はん" }, { t: "年", r: "とし" }] },
  ] },
  { c: "日", m: "day; sun", on: "ニチ, ジツ", kun: "ひ, か", rad: "日 (sun)", mn: "A window framing the sun — one sun, one day.", strokes: 4, ch: 2, vocab: [
    { w: "今日", r: "kyou", m: "today", f: [{ t: "今日", r: "きょう" }] },
    { w: "三日", r: "mikka", m: "third day", f: [{ t: "三", r: "みっ" }, { t: "日", r: "か" }] },
  ] },
  { c: "月", m: "moon; month", on: "ゲツ, ガツ", kun: "つき", rad: "月 (moon)", mn: "A crescent moon hanging in the sky — the moon marks the month.", strokes: 4, ch: 2, vocab: [
    { w: "月曜日", r: "getsuyoubi", m: "Monday", f: [{ t: "月", r: "げつ" }, { t: "曜", r: "よう" }, { t: "日", r: "び" }] },
    { w: "月", r: "tsuki", m: "moon", f: [{ t: "月", r: "つき" }] },
  ] },
  { c: "火", m: "fire", on: "カ", kun: "ひ", rad: "火 (fire)", mn: "A person (人) with sparks flying off — fire.", strokes: 4, ch: 2, vocab: [
    { w: "火曜日", r: "kayoubi", m: "Tuesday", f: [{ t: "火", r: "か" }, { t: "曜", r: "よう" }, { t: "日", r: "び" }] },
    { w: "花火", r: "hanabi", m: "fireworks", f: [{ t: "花", r: "はな" }, { t: "火", r: "び" }] },
  ] },
  { c: "水", m: "water", on: "スイ", kun: "みず", rad: "水 (water)", mn: "A stream splitting into droplets — flowing water.", strokes: 4, ch: 2, vocab: [
    { w: "水曜日", r: "suiyoubi", m: "Wednesday", f: [{ t: "水", r: "すい" }, { t: "曜", r: "よう" }, { t: "日", r: "び" }] },
    { w: "水", r: "mizu", m: "water", f: [{ t: "水", r: "みず" }] },
  ] },
  { c: "木", m: "tree; wood", on: "モク, ボク", kun: "き", rad: "木 (tree)", mn: "A trunk with branches and roots — a tree.", strokes: 4, ch: 2, vocab: [
    { w: "木曜日", r: "mokuyoubi", m: "Thursday", f: [{ t: "木", r: "もく" }, { t: "曜", r: "よう" }, { t: "日", r: "び" }] },
    { w: "木", r: "ki", m: "tree", f: [{ t: "木", r: "き" }] },
  ] },
  { c: "金", m: "gold; money", on: "キン, コン", kun: "かね", rad: "金 (metal)", mn: "A roof hiding two nuggets in the earth — buried gold, money.", strokes: 8, ch: 2, vocab: [
    { w: "金曜日", r: "kin'youbi", m: "Friday", f: [{ t: "金", r: "きん" }, { t: "曜", r: "よう" }, { t: "日", r: "び" }] },
    { w: "お金", r: "okane", m: "money", f: [{ t: "お" }, { t: "金", r: "かね" }] },
  ] },
  { c: "土", m: "earth; soil", on: "ド, ト", kun: "つち", rad: "土 (earth)", mn: "A plant sprouting from the ground — soil.", strokes: 3, ch: 2, vocab: [
    { w: "土曜日", r: "doyoubi", m: "Saturday", f: [{ t: "土", r: "ど" }, { t: "曜", r: "よう" }, { t: "日", r: "び" }] },
    { w: "土", r: "tsuchi", m: "soil", f: [{ t: "土", r: "つち" }] },
  ] },
  { c: "曜", m: "day of the week", on: "ヨウ", kun: "—", rad: "日 (sun)", mn: "The sun (日) with wings — days fly by the week.", strokes: 18, ch: 2, vocab: [
    { w: "曜日", r: "youbi", m: "day of the week", f: [{ t: "曜", r: "よう" }, { t: "日", r: "び" }] },
    { w: "日曜日", r: "nichiyoubi", m: "Sunday", f: [{ t: "日", r: "にち" }, { t: "曜", r: "よう" }, { t: "日", r: "び" }] },
  ] },
  { c: "年", m: "year", on: "ネン", kun: "とし", rad: "干 (dry)", mn: "A bundle of harvested rice — one harvest, one year.", strokes: 6, ch: 2, vocab: [
    { w: "今年", r: "kotoshi", m: "this year", f: [{ t: "今年", r: "ことし" }] },
    { w: "来年", r: "rainen", m: "next year", f: [{ t: "来", r: "らい" }, { t: "年", r: "ねん" }] },
  ] },
  { c: "今", m: "now", on: "コン", kun: "いま", rad: "人 (person)", mn: "A roof over a snapped twig — this very moment: now.", strokes: 4, ch: 2, vocab: [
    { w: "今", r: "ima", m: "now", f: [{ t: "今", r: "いま" }] },
    { w: "今晩", r: "konban", m: "this evening", f: [{ t: "今", r: "こん" }, { t: "晩", r: "ばん" }] },
  ] },
  { c: "週", m: "week", on: "シュウ", kun: "—", rad: "⻌ (walk)", mn: "A lap around the track (⻌) — one circuit is a week.", strokes: 11, ch: 2, vocab: [
    { w: "毎週", r: "maishuu", m: "every week", f: [{ t: "毎", r: "まい" }, { t: "週", r: "しゅう" }] },
    { w: "今週", r: "konshuu", m: "this week", f: [{ t: "今", r: "こん" }, { t: "週", r: "しゅう" }] },
  ] },
  { c: "先", m: "before; ahead", on: "セン", kun: "さき", rad: "儿 (legs)", mn: "Legs ahead of the crowd — the one who came before, ahead.", strokes: 6, ch: 2, vocab: [
    { w: "先生", r: "sensei", m: "teacher", f: [{ t: "先", r: "せん" }, { t: "生", r: "せい" }] },
    { w: "先週", r: "senshuu", m: "last week", f: [{ t: "先", r: "せん" }, { t: "週", r: "しゅう" }] },
  ] },
  { c: "毎", m: "every", on: "マイ", kun: "—", rad: "母 (mother)", mn: "A mother (母) with a hat on — mother does it every day.", strokes: 6, ch: 2, vocab: [
    { w: "毎日", r: "mainichi", m: "every day", f: [{ t: "毎", r: "まい" }, { t: "日", r: "にち" }] },
    { w: "毎年", r: "maitoshi", m: "every year", f: [{ t: "毎", r: "まい" }, { t: "年", r: "とし" }] },
  ] },
  { c: "朝", m: "morning", on: "チョウ", kun: "あさ", rad: "月 (moon)", mn: "The sun rising as the moon (月) still lingers — morning.", strokes: 12, ch: 2, vocab: [
    { w: "朝", r: "asa", m: "morning", f: [{ t: "朝", r: "あさ" }] },
    { w: "今朝", r: "kesa", m: "this morning", f: [{ t: "今朝", r: "けさ" }] },
  ] },
  { c: "昼", m: "noon; daytime", on: "チュウ", kun: "ひる", rad: "日 (sun)", mn: "The sun (日) at its highest shelf — noon.", strokes: 9, ch: 2, vocab: [
    { w: "昼", r: "hiru", m: "noon", f: [{ t: "昼", r: "ひる" }] },
    { w: "昼ご飯", r: "hirugohan", m: "lunch", f: [{ t: "昼", r: "ひる" }, { t: "ご" }, { t: "飯", r: "はん" }] },
  ] },

  // ---- Chapter 3: People & positions ----
  { c: "夜", m: "night", on: "ヤ", kun: "よる", rad: "夕 (evening)", mn: "A person under a roof as evening falls — night.", strokes: 8, ch: 3, vocab: [
    { w: "夜", r: "yoru", m: "night", f: [{ t: "夜", r: "よる" }] },
    { w: "今夜", r: "kon'ya", m: "tonight", f: [{ t: "今", r: "こん" }, { t: "夜", r: "や" }] },
  ] },
  { c: "人", m: "person", on: "ジン, ニン", kun: "ひと", rad: "人 (person)", mn: "Two legs walking — a person.", strokes: 2, ch: 3, vocab: [
    { w: "人", r: "hito", m: "person", f: [{ t: "人", r: "ひと" }] },
    { w: "三人", r: "sannin", m: "three people", f: [{ t: "三", r: "さん" }, { t: "人", r: "にん" }] },
  ] },
  { c: "男", m: "man", on: "ダン, ナン", kun: "おとこ", rad: "力 (power)", mn: "Strength (力) in the rice field (田) — a man.", strokes: 7, ch: 3, vocab: [
    { w: "男の人", r: "otoko no hito", m: "man", f: [{ t: "男", r: "おとこ" }, { t: "の" }, { t: "人", r: "ひと" }] },
    { w: "男の子", r: "otokonoko", m: "boy", f: [{ t: "男", r: "おとこ" }, { t: "の" }, { t: "子", r: "こ" }] },
  ] },
  { c: "女", m: "woman", on: "ジョ, ニョ", kun: "おんな", rad: "女 (woman)", mn: "A graceful figure seated — a woman.", strokes: 3, ch: 3, vocab: [
    { w: "女の人", r: "onna no hito", m: "woman", f: [{ t: "女", r: "おんな" }, { t: "の" }, { t: "人", r: "ひと" }] },
    { w: "女の子", r: "onnanoko", m: "girl", f: [{ t: "女", r: "おんな" }, { t: "の" }, { t: "子", r: "こ" }] },
  ] },
  { c: "子", m: "child", on: "シ, ス", kun: "こ", rad: "子 (child)", mn: "A baby with arms out for a hug — a child.", strokes: 3, ch: 3, vocab: [
    { w: "子供", r: "kodomo", m: "child", f: [{ t: "子", r: "こ" }, { t: "供", r: "ども" }] },
    { w: "男の子", r: "otokonoko", m: "boy", f: [{ t: "男", r: "おとこ" }, { t: "の" }, { t: "子", r: "こ" }] },
  ] },
  { c: "父", m: "father", on: "フ", kun: "ちち", rad: "父 (father)", mn: "Two arms crossed firm — father.", strokes: 4, ch: 3, vocab: [
    { w: "父", r: "chichi", m: "(my) father", f: [{ t: "父", r: "ちち" }] },
    { w: "お父さん", r: "otousan", m: "father", f: [{ t: "お" }, { t: "父", r: "とう" }, { t: "さん" }] },
  ] },
  { c: "母", m: "mother", on: "ボ", kun: "はは", rad: "母 (mother)", mn: "A woman (女) holding two children close — mother.", strokes: 5, ch: 3, vocab: [
    { w: "母", r: "haha", m: "(my) mother", f: [{ t: "母", r: "はは" }] },
    { w: "お母さん", r: "okaasan", m: "mother", f: [{ t: "お" }, { t: "母", r: "かあ" }, { t: "さん" }] },
  ] },
  { c: "友", m: "friend", on: "ユウ", kun: "とも", rad: "又 (again)", mn: "Two hands reaching for each other — friends.", strokes: 4, ch: 3, vocab: [
    { w: "友達", r: "tomodachi", m: "friend", f: [{ t: "友", r: "とも" }, { t: "達", r: "だち" }] },
    { w: "親友", r: "shin'yuu", m: "best friend", f: [{ t: "親", r: "しん" }, { t: "友", r: "ゆう" }] },
  ] },
  { c: "名", m: "name", on: "メイ, ミョウ", kun: "な", rad: "口 (mouth)", mn: "An evening (夕) call from a mouth (口) — calling a name in the dark.", strokes: 6, ch: 3, vocab: [
    { w: "名前", r: "namae", m: "name", f: [{ t: "名", r: "な" }, { t: "前", r: "まえ" }] },
    { w: "有名", r: "yuumei", m: "famous", f: [{ t: "有", r: "ゆう" }, { t: "名", r: "めい" }] },
  ] },
  { c: "前", m: "before; front", on: "ゼン", kun: "まえ", rad: "刀 (sword)", mn: "A boat cut by a knife — what lies ahead, in front.", strokes: 9, ch: 3, vocab: [
    { w: "前", r: "mae", m: "front; before", f: [{ t: "前", r: "まえ" }] },
    { w: "午前", r: "gozen", m: "a.m.", f: [{ t: "午", r: "ご" }, { t: "前", r: "ぜん" }] },
  ] },
  { c: "後", m: "after; behind", on: "ゴ, コウ", kun: "あと, うし(ろ)", rad: "彳 (step)", mn: "Small steps trailing behind — after, behind.", strokes: 9, ch: 3, vocab: [
    { w: "後ろ", r: "ushiro", m: "behind", f: [{ t: "後", r: "うし" }, { t: "ろ" }] },
    { w: "午後", r: "gogo", m: "p.m.", f: [{ t: "午", r: "ご" }, { t: "後", r: "ご" }] },
  ] },
  { c: "右", m: "right", on: "ウ, ユウ", kun: "みぎ", rad: "口 (mouth)", mn: "A hand over a mouth (口) — you eat with your right hand.", strokes: 5, ch: 3, vocab: [
    { w: "右", r: "migi", m: "right", f: [{ t: "右", r: "みぎ" }] },
    { w: "右側", r: "migigawa", m: "right side", f: [{ t: "右", r: "みぎ" }, { t: "側", r: "がわ" }] },
  ] },
  { c: "左", m: "left", on: "サ", kun: "ひだり", rad: "工 (craft)", mn: "A hand holding a carpenter's square (工) — the left hand steadies the work.", strokes: 5, ch: 3, vocab: [
    { w: "左", r: "hidari", m: "left", f: [{ t: "左", r: "ひだり" }] },
    { w: "左側", r: "hidarigawa", m: "left side", f: [{ t: "左", r: "ひだり" }, { t: "側", r: "がわ" }] },
  ] },
  { c: "中", m: "inside; middle", on: "チュウ", kun: "なか", rad: "丨 (line)", mn: "A box pierced through the middle — inside.", strokes: 4, ch: 3, vocab: [
    { w: "中", r: "naka", m: "inside", f: [{ t: "中", r: "なか" }] },
    { w: "一日中", r: "ichinichijuu", m: "all day long", f: [{ t: "一", r: "いち" }, { t: "日", r: "にち" }, { t: "中", r: "じゅう" }] },
  ] },
  { c: "上", m: "up; above", on: "ジョウ", kun: "うえ, あ(がる)", rad: "一 (one)", mn: "A small mark above the baseline — up, above.", strokes: 3, ch: 3, vocab: [
    { w: "上", r: "ue", m: "above", f: [{ t: "上", r: "うえ" }] },
    { w: "上手", r: "jouzu", m: "skillful", f: [{ t: "上手", r: "じょうず" }] },
  ] },
  { c: "下", m: "down; below", on: "カ, ゲ", kun: "した, さ(がる)", rad: "一 (one)", mn: "A small mark below the baseline — down, below.", strokes: 3, ch: 3, vocab: [
    { w: "下", r: "shita", m: "below", f: [{ t: "下", r: "した" }] },
    { w: "地下", r: "chika", m: "underground", f: [{ t: "地", r: "ち" }, { t: "下", r: "か" }] },
  ] },
];
