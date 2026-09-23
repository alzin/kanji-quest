"""Build the checked-in N3 cards from local, pinned dictionary snapshots.

Usage: python scripts/import-n3.py kanji.json kanjidic2-en.json jmdict-eng-common.json
Source URLs, versions and licensing are recorded in src/data/n3/SOURCES.md.
No dictionary downloads or lookups happen in the application.
"""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def hira(text):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in text)


def romaji(text):
    rows = [('','あいうえお'),('k','かきくけこ'),('g','がぎぐげご'),('s','さしすせそ'),('z','ざじずぜぞ'),('t','たちつてと'),('d','だぢづでど'),('n','なにぬねの'),('h','はひふへほ'),('b','ばびぶべぼ'),('p','ぱぴぷぺぽ'),('m','まみむめも'),('r','らりるれろ')]
    table = {c: consonant + 'aiueo'[i] for consonant, row in rows for i, c in enumerate(row)}
    table.update({'し':'shi','ち':'chi','つ':'tsu','じ':'ji','ぢ':'ji','ふ':'fu','づ':'zu','や':'ya','ゆ':'yu','よ':'yo','わ':'wa','を':'wo','ん':'n'})
    out = ''; double = False; i = 0
    while i < len(text):
        c = text[i]; i += 1
        if c == 'っ':
            double = True; continue
        syllable = table[c]
        if c == 'ん' and i < len(text) and text[i] in 'あいうえおやゆよ':
            syllable = "n'"
        if i < len(text) and text[i] in 'ゃゅょ':
            stem = syllable[:-1]
            syllable = stem + ('' if stem in ('sh', 'ch', 'j') else 'y') + {'ゃ':'a','ゅ':'u','ょ':'o'}[text[i]]
            i += 1
        if double:
            syllable = syllable[0] + syllable; double = False
        out += syllable
    return out


def main():
    reference, kanjidic, jmdict = (load(p) for p in sys.argv[1:])
    meta = {k['literal']: k for k in kanjidic['characters']}
    foundation = ''.join(re.findall(r'\[\d+, "[^"]*", "[^"]*", "([^"]+)"\]', (ROOT/'src/data/regions.ts').read_text(encoding='utf-8').split('...group(56, "N3"')[0]))
    expected = {c for c, k in reference.items() if k['jlpt_new'] == 3 and c not in foundation}
    rows = [line.split('\t') for line in (ROOT/'content/n3-regions.tsv').read_text(encoding='utf-8').splitlines()]
    chars = ''.join(row[2] for row in rows)
    assert set(chars) == expected and len(chars) == len(expected), ('Coverage mismatch', expected-set(chars), set(chars)-expected)
    assert all(4 <= len(row[2]) <= 6 for row in rows)
    notes = dict(line.split('\t', 1) for line in (ROOT/'content/n3-mnemonics.tsv').read_text(encoding='utf-8').splitlines())
    assert set(notes) == expected, ('Mnemonic coverage', expected-set(notes))
    order = {c: i for i, c in enumerate(foundation + chars)}
    readings = {}
    for c, k in meta.items():
        readings[c] = {hira(r['value']).split('.')[0].strip('-') for g in k['readingMeaning']['groups'] for r in g['readings'] if r['type'] in ('ja_on', 'ja_kun')} if k.get('readingMeaning') else set()

    def furigana(surface, kana):
        # Exact kana anchors and known kanji readings, including sound changes.
        def split(i, j):
            if i == len(surface): return [] if j == len(kana) else None
            c = surface[i]
            if not '\u4e00' <= c <= '\u9fff':
                tail = split(i+1, j+1) if kana[j:j+1] == c else None
                return [{'t':c}] + tail if tail is not None else None
            candidates = set(readings.get(c, set()))
            for r in list(candidates):
                if not r: continue
                if r[-1] in 'くつちき': candidates.add(r[:-1]+'っ')
                for source, target in [('かきくけこ','がぎぐげご'),('さしすせそ','ざじずぜぞ'),('たちつてと','だぢづでど'),('はひふへほ','ばびぶべぼ'),('はひふへほ','ぱぴぷぺぽ')]:
                    if r[0] in source: candidates.add(target[source.index(r[0])]+r[1:])
            for r in sorted(candidates, key=lambda r: (-len(r), r)):
                if r and kana.startswith(r, j):
                    tail = split(i+1, j+len(r))
                    if tail is not None: return [{'t':c,'r':r}]+tail
            return None
        result = split(0, 0)
        # Preserve dictionary-confirmed irregular readings as a whole span.
        return result if result is not None else [{'t':surface, 'r':kana}]

    candidates = {c: {} for c in chars}
    accepted = {}
    preferred = dict(line.split('\t') for line in (ROOT/'content/n3-preferred-readings.tsv').read_text(encoding='utf-8').splitlines())
    for entry in jmdict['words']:
        for spelling in entry['kanji']:
            w = spelling['text']
            if (set(spelling['tags']) - {'ateji'} and w not in preferred) or not re.fullmatch('[一-鿿ぁ-ゖ]{1,6}', w): continue
            for reading in entry['kana']:
                kana = reading['text']
                if set(reading['tags']) - {'gikun'} or not re.fullmatch('[ぁ-ゖ]+', kana): continue
                if reading['appliesToKanji'] != ['*'] and w not in reading['appliesToKanji']: continue
                sense = next((s for s in entry['sense'] if (s['appliesToKanji'] == ['*'] or w in s['appliesToKanji']) and (s['appliesToKana'] == ['*'] or kana in s['appliesToKana']) and not s['dialect'] and not set(s['misc']) & {'arch','obs','rare','vulg','sl'}), None)
                if not sense: continue
                accepted.setdefault(w, set()).add(kana)
                gloss = '; '.join(g['text'] for g in sense['gloss'][:2])
                for c in set(w) & expected:
                    score = (int(w in preferred and kana != preferred[w]), int(not spelling['common']) + int(not reading['common']), sum(12 if x not in order else 2 if order[x] > order[c] else 0 for x in w if '\u4e00' <= x <= '\u9fff'), abs(len(w)-2), len(kana), w, kana)
                    if w not in candidates[c] or score < candidates[c][w][0]:
                        candidates[c][w] = (score, {'w':w,'r':romaji(kana),'m':gloss,'f':furigana(w,kana)})
    overrides = dict((line.split('\t')[0], line.split('\t')[1].split()) for line in (ROOT/'content/n3-vocabulary.tsv').read_text(encoding='utf-8').splitlines())
    missing = [(c,w) for c,ws in overrides.items() for w in ws if w not in candidates[c]]
    assert not missing, ('Vocabulary missing from dictionary', missing)
    assert all(reading in accepted.get(w, set()) for w, reading in preferred.items()), 'Preferred reading not confirmed by dictionary'
    cards = []; keywords = set(); audit = []
    for index, (name, jp, region_chars) in enumerate(rows):
        for c in region_chars:
            k = meta[c]; groups = k['readingMeaning']['groups']; rs = [r for g in groups for r in g['readings']]
            meanings = [m['value'].lower() for g in groups for m in g['meanings'] if m['lang']=='en']
            keyword = next((m for m in meanings if m not in keywords), None)
            assert keyword, ('Keyword collision', c, meanings)
            keywords.add(keyword)
            pool = sorted(candidates[c].values(), key=lambda x:x[0])
            words = [candidates[c][w][1] for w in overrides[c]] if c in overrides else [p[1] for p in pool[:3]]
            assert len(words)>=2 and len({w['w'] for w in words})==len(words), ('Need distinct words', c)
            rad = next(r['value'] for r in k['radicals'] if r['type']=='classical')
            cards.append(dict(c=c, m='; '.join(meanings[:3]), keyword=keyword, on=', '.join(r['value'] for r in rs if r['type']=='ja_on') or '—', kun=', '.join(re.sub(r'\.([ぁ-ゖ]+)', r'(\1)', r['value']) for r in rs if r['type']=='ja_kun') or '—', rad=unicodedata.normalize('NFKC',chr(0x2f00+rad-1)), strokes=k['misc']['strokeCounts'][0], ch=56+index, mn=notes[c], vocab=words))
            audit.append(c+' '+ ' | '.join(w['w']+' '+''.join(s.get('r',s['t']) for s in w['f'])+' '+w['m'] for w in words))
    out = ROOT/'src/data/n3'; out.mkdir(exist_ok=True)
    (out/'cards.ts').write_text('// Generated by scripts/import-n3.py. Dictionary attribution: SOURCES.md.\nimport type { Kanji } from "../n5/types";\n\nexport const n3Kanji: Kanji[] = '+json.dumps(cards,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    taught = {w['w'] for k in cards for w in k['vocab']}
    (out/'readings.ts').write_text('// Generated by scripts/import-n3.py. Dictionary attribution: SOURCES.md.\nexport const n3Readings: Readonly<Record<string, readonly string[]>> = '+json.dumps({w:sorted(accepted[w]) for w in sorted(taught) if len(accepted[w])>1},ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    (out/'manifest.json').write_text(json.dumps({'level':'N3','cards':len(cards),'regions':len(rows),'nativeReviewed':False,'dictionaryDate':jmdict['dictDate'],'inputs':{Path(p).name:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in sys.argv[1:]}},indent=2)+'\n',encoding='utf-8')
    (ROOT/'content/n3-vocabulary-audit.txt').write_text('\n'.join(audit)+'\n',encoding='utf-8')
    print(f'{len(cards)} cards, {len(rows)} regions, {sum(len(k["vocab"]) for k in cards)} dictionary-confirmed vocabulary examples')


if __name__ == '__main__': main()
