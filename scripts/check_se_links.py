import urllib.request
import re

url = 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice'
with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})) as r:
    html = r.read().decode('utf-8')
    links = re.findall(r'href="([^"]+\.(?:azw3|kepub|epub))"', html)
    print("Links found:", links)
