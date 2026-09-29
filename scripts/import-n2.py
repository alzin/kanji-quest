"""Build N2 using the same pinned dictionaries and checks as N3.

Usage: python scripts/import-n2.py kanji.json kanjidic2-en.json jmdict-eng-common.json
Source and license details: src/data/n2/SOURCES.md.
"""
import runpy
from pathlib import Path

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('import-n3.py')))['main'](2, 126)
