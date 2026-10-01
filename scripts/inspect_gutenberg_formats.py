import urllib.request
import re

headers = {'User-Agent': 'Mozilla/5.0'}

for bid in [11, 84, 1342, 345]:
    url = f'https://www.gutenberg.org/ebooks/{bid}'
    req = urllib.request.Request(url, headers=headers)
    try:
        html = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', 'ignore')
        matches = re.findall(r'href=["\']([^"\']*(?:mobi|azw|kf8|kindle)[^"\']*)["\']', html, re.I)
        print(f"Gutenberg {bid}: {matches}")
    except Exception as e:
        print(f"Error {bid}: {e}")
