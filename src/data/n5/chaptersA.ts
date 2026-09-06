import type { Kanji } from "./types";

// Chapters 1–3: numbers & time, days & people, positions
export const chaptersA: Kanji[] = [
  // ---- Chapter 1: Numbers & time basics ----
  { c: "一", m: "one", on: "イチ, イツ", kun: "ひと(つ)", rad: "一 (one)", mn: "A single horizontal stroke — the number one.", strokes: 1, ch: 1, vocab: [
    { w: "一つ", r: "hitotsu", m: "one (thing)" }, { w: "一人", r: "hitori", m: "one person" }] },
  { c: "二", m: "two", on: "ニ", kun: "ふた(つ)", rad: "二 (two)", mn: "Two parallel lines — count them: one, two.", strokes: 2, ch: 1, vocab: [
    { w: "二つ", r: "futatsu", m: "two (things)" }, { w: "二人", r: "futari", m: "two people" }] },
  { c: "三", m: "three", on: "サン", kun: "みっ(つ)", rad: "一 (one)", mn: "Three stacked lines — one, two, three.", strokes: 3, ch: 1, vocab: [
    { w: "三つ", r: "mittsu", m: "three (things)" }, { w: "三月", r: "sangatsu", m: "March" }] },
  { c: "四", m: "four", on: "シ", kun: "よ(ん), よっ(つ)", rad: "囗 (enclosure)", mn: "A box with two legs inside — a square has four sides.", strokes: 5, ch: 1, vocab: [
    { w: "四つ", r: "yottsu", m: "four (things)" }, { w: "四月", r: "shigatsu", m: "April" }] },
  { c: "五", m: "five", on: "ゴ", kun: "いつ(つ)", rad: "二 (two)", mn: "Lines crossing to count — a hand holds five fingers.", strokes: 4, ch: 1, vocab: [
    { w: "五つ", r: "itsutsu", m: "five (things)" }, { w: "五月", r: "gogatsu", m: "May" }] },
  { c: "六", m: "six", on: "ロク", kun: "むっ(つ)", rad: "八 (eight)", mn: "A hat on a table with two legs — a lucky table for six.", strokes: 4, ch: 1, vocab: [
    { w: "六つ", r: "muttsu", m: "six (things)" }, { w: "六月", r: "rokugatsu", m: "June" }] },
  { c: "七", m: "seven", on: "シチ", kun: "なな(つ)", rad: "一 (one)", mn: "A cross sliced by a hook — lucky number seven.", strokes: 2, ch: 1, vocab: [
    { w: "七つ", r: "nanatsu", m: "seven (things)" }, { w: "七月", r: "shichigatsu", m: "July" }] },
  { c: "八", m: "eight", on: "ハチ", kun: "やっ(つ)", rad: "八 (eight)", mn: "Two strokes spreading wide — like a mountain road splitting eight ways.", strokes: 2, ch: 1, vocab: [
    { w: "八つ", r: "yattsu", m: "eight (things)" }, { w: "八月", r: "hachigatsu", m: "August" }] },
  { c: "九", m: "nine", on: "キュウ, ク", kun: "ここの(つ)", rad: "乙 (second)", mn: "An arm bent at the elbow — nine is almost ten.", strokes: 2, ch: 1, vocab: [
    { w: "九つ", r: "kokonotsu", m: "nine (things)" }, { w: "九月", r: "kugatsu", m: "September" }] },
  { c: "十", m: "ten", on: "ジュウ", kun: "とお", rad: "十 (ten)", mn: "A perfect cross — ten completes the count.", strokes: 2, ch: 1, vocab: [
    { w: "十", r: "too", m: "ten" }, { w: "十月", r: "juugatsu", m: "October" }] },
  { c: "百", m: "hundred", on: "ヒャク", kun: "—", rad: "白 (white)", mn: "One (一) white (白) — one hundred.", strokes: 6, ch: 1, vocab: [
    { w: "百", r: "hyaku", m: "hundred" }, { w: "三百", r: "sanbyaku", m: "three hundred" }] },
  { c: "千", m: "thousand", on: "セン", kun: "ち", rad: "十 (ten)", mn: "Ten (十) with a sweep on top — ten hundreds make a thousand.", strokes: 3, ch: 1, vocab: [
    { w: "千", r: "sen", m: "thousand" }, { w: "三千", r: "sanzen", m: "three thousand" }] },
  { c: "万", m: "ten thousand", on: "マン, バン", kun: "—", rad: "一 (one)", mn: "A big sweeping roof — numbers too big for two hands: ten thousand.", strokes: 3, ch: 1, vocab: [
    { w: "一万", r: "ichiman", m: "ten thousand" }, { w: "万年筆", r: "mannenhitsu", m: "fountain pen" }] },
  { c: "円", m: "yen; circle", on: "エン", kun: "まる(い)", rad: "冂 (border)", mn: "A coin in a frame — the round yen.", strokes: 4, ch: 1, vocab: [
    { w: "百円", r: "hyakuen", m: "100 yen" }, { w: "円い", r: "marui", m: "round" }] },
  { c: "時", m: "time; hour", on: "ジ", kun: "とき", rad: "日 (sun)", mn: "Sun (日) at the temple (寺) — the temple bell marks the hour.", strokes: 10, ch: 1, vocab: [
    { w: "一時", r: "ichiji", m: "one o'clock" }, { w: "時々", r: "tokidoki", m: "sometimes" }] },
  { c: "分", m: "minute; to divide", on: "ブン, フン, プン", kun: "わ(かる)", rad: "刀 (sword)", mn: "Eight (八) cut by a sword (刀) — divided into parts, like minutes.", strokes: 4, ch: 1, vocab: [
    { w: "五分", r: "gofun", m: "five minutes" }, { w: "分かる", r: "wakaru", m: "to understand" }] },

  // ---- Chapter 2: Days, weeks, seasons ----
  { c: "半", m: "half", on: "ハン", kun: "なか(ば)", rad: "十 (ten)", mn: "Ten split by two horns — sliced in half.", strokes: 5, ch: 2, vocab: [
    { w: "半分", r: "hanbun", m: "half" }, { w: "半年", r: "hantoshi", m: "half a year" }] },
  { c: "日", m: "day; sun", on: "ニチ, ジツ", kun: "ひ, か", rad: "日 (sun)", mn: "A window framing the sun — one sun, one day.", strokes: 4, ch: 2, vocab: [
    { w: "今日", r: "kyou", m: "today" }, { w: "三日", r: "mikka", m: "third day" }] },
  { c: "月", m: "moon; month", on: "ゲツ, ガツ", kun: "つき", rad: "月 (moon)", mn: "A crescent moon hanging in the sky — the moon marks the month.", strokes: 4, ch: 2, vocab: [
    { w: "月曜日", r: "getsuyoubi", m: "Monday" }, { w: "月", r: "tsuki", m: "moon" }] },
  { c: "火", m: "fire", on: "カ", kun: "ひ", rad: "火 (fire)", mn: "A person (人) with sparks flying off — fire.", strokes: 4, ch: 2, vocab: [
    { w: "火曜日", r: "kayoubi", m: "Tuesday" }, { w: "花火", r: "hanabi", m: "fireworks" }] },
  { c: "水", m: "water", on: "スイ", kun: "みず", rad: "水 (water)", mn: "A stream splitting into droplets — flowing water.", strokes: 4, ch: 2, vocab: [
    { w: "水曜日", r: "suiyoubi", m: "Wednesday" }, { w: "水", r: "mizu", m: "water" }] },
  { c: "木", m: "tree; wood", on: "モク, ボク", kun: "き", rad: "木 (tree)", mn: "A trunk with branches and roots — a tree.", strokes: 4, ch: 2, vocab: [
    { w: "木曜日", r: "mokuyoubi", m: "Thursday" }, { w: "木", r: "ki", m: "tree" }] },
  { c: "金", m: "gold; money", on: "キン, コン", kun: "かね", rad: "金 (metal)", mn: "A roof hiding two nuggets in the earth — buried gold, money.", strokes: 8, ch: 2, vocab: [
    { w: "金曜日", r: "kinyoubi", m: "Friday" }, { w: "お金", r: "okane", m: "money" }] },
  { c: "土", m: "earth; soil", on: "ド, ト", kun: "つち", rad: "土 (earth)", mn: "A plant sprouting from the ground — soil.", strokes: 3, ch: 2, vocab: [
    { w: "土曜日", r: "doyoubi", m: "Saturday" }, { w: "土", r: "tsuchi", m: "soil" }] },
  { c: "曜", m: "day of the week", on: "ヨウ", kun: "—", rad: "日 (sun)", mn: "The sun (日) with wings — days fly by the week.", strokes: 18, ch: 2, vocab: [
    { w: "曜日", r: "youbi", m: "day of the week" }, { w: "日曜日", r: "nichiyoubi", m: "Sunday" }] },
  { c: "年", m: "year", on: "ネン", kun: "とし", rad: "干 (dry)", mn: "A bundle of harvested rice — one harvest, one year.", strokes: 6, ch: 2, vocab: [
    { w: "今年", r: "kotoshi", m: "this year" }, { w: "来年", r: "rainen", m: "next year" }] },
  { c: "今", m: "now", on: "コン", kun: "いま", rad: "人 (person)", mn: "A roof over a snapped twig — this very moment: now.", strokes: 4, ch: 2, vocab: [
    { w: "今", r: "ima", m: "now" }, { w: "今晩", r: "konban", m: "this evening" }] },
  { c: "週", m: "week", on: "シュウ", kun: "—", rad: "⻌ (walk)", mn: "A lap around the track (⻌) — one circuit is a week.", strokes: 11, ch: 2, vocab: [
    { w: "毎週", r: "maishuu", m: "every week" }, { w: "今週", r: "konshuu", m: "this week" }] },
  { c: "先", m: "before; ahead", on: "セン", kun: "さき", rad: "儿 (legs)", mn: "Legs ahead of the crowd — the one who came before, ahead.", strokes: 6, ch: 2, vocab: [
    { w: "先生", r: "sensei", m: "teacher" }, { w: "先週", r: "senshuu", m: "last week" }] },
  { c: "毎", m: "every", on: "マイ", kun: "—", rad: "母 (mother)", mn: "A mother (母) with a hat on — mother does it every day.", strokes: 6, ch: 2, vocab: [
    { w: "毎日", r: "mainichi", m: "every day" }, { w: "毎年", r: "maitoshi", m: "every year" }] },
  { c: "朝", m: "morning", on: "チョウ", kun: "あさ", rad: "月 (moon)", mn: "The sun rising as the moon (月) still lingers — morning.", strokes: 12, ch: 2, vocab: [
    { w: "朝", r: "asa", m: "morning" }, { w: "今朝", r: "kesa", m: "this morning" }] },
  { c: "昼", m: "noon; daytime", on: "チュウ", kun: "ひる", rad: "日 (sun)", mn: "The sun (日) at its highest shelf — noon.", strokes: 9, ch: 2, vocab: [
    { w: "昼", r: "hiru", m: "noon" }, { w: "昼ご飯", r: "hirugohan", m: "lunch" }] },

  // ---- Chapter 3: People & positions ----
  { c: "夜", m: "night", on: "ヤ", kun: "よる", rad: "夕 (evening)", mn: "A person under a roof as evening falls — night.", strokes: 8, ch: 3, vocab: [
    { w: "夜", r: "yoru", m: "night" }, { w: "今夜", r: "konya", m: "tonight" }] },
  { c: "人", m: "person", on: "ジン, ニン", kun: "ひと", rad: "人 (person)", mn: "Two legs walking — a person.", strokes: 2, ch: 3, vocab: [
    { w: "人", r: "hito", m: "person" }, { w: "三人", r: "sannin", m: "three people" }] },
  { c: "男", m: "man", on: "ダン, ナン", kun: "おとこ", rad: "力 (power)", mn: "Strength (力) in the rice field (田) — a man.", strokes: 7, ch: 3, vocab: [
    { w: "男の人", r: "otoko no hito", m: "man" }, { w: "男の子", r: "otokonoko", m: "boy" }] },
  { c: "女", m: "woman", on: "ジョ, ニョ", kun: "おんな", rad: "女 (woman)", mn: "A graceful figure seated — a woman.", strokes: 3, ch: 3, vocab: [
    { w: "女の人", r: "onna no hito", m: "woman" }, { w: "女の子", r: "onnanoko", m: "girl" }] },
  { c: "子", m: "child", on: "シ, ス", kun: "こ", rad: "子 (child)", mn: "A baby with arms out for a hug — a child.", strokes: 3, ch: 3, vocab: [
    { w: "子供", r: "kodomo", m: "child" }, { w: "男の子", r: "otokonoko", m: "boy" }] },
  { c: "父", m: "father", on: "フ", kun: "ちち", rad: "父 (father)", mn: "Two arms crossed firm — father.", strokes: 4, ch: 3, vocab: [
    { w: "父", r: "chichi", m: "(my) father" }, { w: "お父さん", r: "otousan", m: "father" }] },
  { c: "母", m: "mother", on: "ボ", kun: "はは", rad: "母 (mother)", mn: "A woman (女) holding two children close — mother.", strokes: 5, ch: 3, vocab: [
    { w: "母", r: "haha", m: "(my) mother" }, { w: "お母さん", r: "okaasan", m: "mother" }] },
  { c: "友", m: "friend", on: "ユウ", kun: "とも", rad: "又 (again)", mn: "Two hands reaching for each other — friends.", strokes: 4, ch: 3, vocab: [
    { w: "友達", r: "tomodachi", m: "friend" }, { w: "親友", r: "shinyuu", m: "best friend" }] },
  { c: "名", m: "name", on: "メイ, ミョウ", kun: "な", rad: "口 (mouth)", mn: "An evening (夕) call from a mouth (口) — calling a name in the dark.", strokes: 6, ch: 3, vocab: [
    { w: "名前", r: "namae", m: "name" }, { w: "有名", r: "yuumei", m: "famous" }] },
  { c: "前", m: "before; front", on: "ゼン", kun: "まえ", rad: "刀 (sword)", mn: "A boat cut by a knife — what lies ahead, in front.", strokes: 9, ch: 3, vocab: [
    { w: "前", r: "mae", m: "front; before" }, { w: "午前", r: "gozen", m: "a.m." }] },
  { c: "後", m: "after; behind", on: "ゴ, コウ", kun: "あと, うし(ろ)", rad: "彳 (step)", mn: "Small steps trailing behind — after, behind.", strokes: 9, ch: 3, vocab: [
    { w: "後ろ", r: "ushiro", m: "behind" }, { w: "午後", r: "gogo", m: "p.m." }] },
  { c: "右", m: "right", on: "ウ, ユウ", kun: "みぎ", rad: "口 (mouth)", mn: "A hand over a mouth (口) — you eat with your right hand.", strokes: 5, ch: 3, vocab: [
    { w: "右", r: "migi", m: "right" }, { w: "右側", r: "migigawa", m: "right side" }] },
  { c: "左", m: "left", on: "サ", kun: "ひだり", rad: "工 (craft)", mn: "A hand holding a carpenter's square (工) — the left hand steadies the work.", strokes: 5, ch: 3, vocab: [
    { w: "左", r: "hidari", m: "left" }, { w: "左側", r: "hidarigawa", m: "left side" }] },
  { c: "中", m: "inside; middle", on: "チュウ", kun: "なか", rad: "丨 (line)", mn: "A box pierced through the middle — inside.", strokes: 4, ch: 3, vocab: [
    { w: "中", r: "naka", m: "inside" }, { w: "一日中", r: "ichinichijuu", m: "all day long" }] },
  { c: "上", m: "up; above", on: "ジョウ", kun: "うえ, あ(がる)", rad: "一 (one)", mn: "A small mark above the baseline — up, above.", strokes: 3, ch: 3, vocab: [
    { w: "上", r: "ue", m: "above" }, { w: "上手", r: "jouzu", m: "skillful" }] },
  { c: "下", m: "down; below", on: "カ, ゲ", kun: "した, さ(がる)", rad: "一 (one)", mn: "A small mark below the baseline — down, below.", strokes: 3, ch: 3, vocab: [
    { w: "下", r: "shita", m: "below" }, { w: "地下", r: "chika", m: "underground" }] },
];
