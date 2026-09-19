#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 hanzi-writer-data (makemeahanzi) 的单字 JSON 压缩成本地内置笔顺数据。

输出 public/data/strokes.json:
  { "字": [[[x,y], ...该笔中线采样点], ...每笔], ... }

坐标系 1024x1024，原点左上、y 向下（与 SVG/Canvas 一致，无需翻转）。
"""
import json, glob, os, sys, gzip

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/hwd/package'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'public/data/strokes.json'

def main():
    out = {}
    skipped = 0
    for f in sorted(glob.glob(os.path.join(SRC, '*.json'))):
        ch = os.path.splitext(os.path.basename(f))[0]
        if len(ch) != 1:
            continue
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            skipped += 1
            continue
        if 'medians' not in d or 'strokes' not in d:
            skipped += 1
            continue
        medians = [[[int(round(x)), int(round(y))] for x, y in m]
                   for m in d['medians']]
        out[ch] = medians

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    raw = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(raw)
    gz = OUT + '.gz'
    with gzip.open(gz, 'wb', compresslevel=9) as fh:
        fh.write(raw.encode('utf-8'))
    print(f'chars: {len(out)}  skipped: {skipped}')
    print(f'raw: {os.path.getsize(OUT)/1e6:.2f} MB  gzip: {os.path.getsize(gz)/1e6:.2f} MB')

if __name__ == '__main__':
    main()
