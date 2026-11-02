#!/usr/bin/env python3
"""Generate judy.html from index.html (static head for Judy: manifest, icons, title).
Run before committing any change to index.html:  python3 tools/sync_judy.py"""
import re,sys
s=open('index.html',encoding='utf-8').read()
def sub(a,b):
    global s
    if a not in s: sys.exit('missing: '+a[:50])
    s=s.replace(a,b,1)
sub('<link rel="manifest" href="/manifest.json">','<link rel="manifest" href="/manifest-judy.json">')
sub('<link rel="apple-touch-icon" href="/icons/icon-180.png">','<link rel="apple-touch-icon" href="/icons/judy-180.png">')
sub('<link rel="icon" href="/icons/logo.svg" type="image/svg+xml">','<link rel="icon" href="/icons/judy.svg" type="image/svg+xml">')
sub('<meta name="theme-color" content="#1B6870">','<meta name="theme-color" content="#C447A8">')
s=re.sub(r'<title>.*?</title>','<title>جودي تتعلّم</title>',s,count=1,flags=re.S)
open('judy.html','w',encoding='utf-8').write(s)
print('judy.html written',len(s))
