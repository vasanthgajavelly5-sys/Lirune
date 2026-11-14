import json
import os
import re
import urllib.request

DICT_URL = "https://raw.githubusercontent.com/adambom/dictionary/master/dictionary.json"
TARGET_PATH = r"c:\Users\vasanth\Desktop\Programs\Epub reader\mobile\assets\dictionary.json"

os.makedirs(os.path.dirname(TARGET_PATH), exist_ok=True)

print("Fetching dictionary data...")
req = urllib.request.Request(DICT_URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=30) as resp:
    raw_dict = json.loads(resp.read().decode("utf-8"))

print(f"Loaded {len(raw_dict)} total entries.")

# Load common English wordlist to prioritize real everyday & literary words
COMMON_WORDS_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt"
try:
    req_comm = urllib.request.Request(COMMON_WORDS_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req_comm, timeout=20) as resp_c:
        common_list = [w.strip().lower() for w in resp_c.read().decode("utf-8").splitlines() if w.strip()]
    print(f"Loaded {len(common_list)} priority common words.")
except Exception as e:
    print(f"Could not load priority list: {e}")
    common_list = []

# Build dictionary
dictionary = {}

def parse_pos(defn):
    d = defn.strip()
    if d.startswith("a.") or d.startswith("adj."): return "adjective"
    if d.startswith("n.") or d.startswith("noun."): return "noun"
    if d.startswith("v.") or d.startswith("v. t.") or d.startswith("v. i."): return "verb"
    if d.startswith("adv."): return "adverb"
    if d.startswith("prep."): return "preposition"
    if d.startswith("conj."): return "conjunction"
    if d.startswith("interj."): return "interjection"
    return "noun"

# 1. Process priority common words first
for word in common_list:
    upper = word.upper()
    if upper in raw_dict:
        defn = raw_dict[upper].strip()
        # Clean leading pos mark
        pos = parse_pos(defn)
        clean_defn = re.sub(r'^(?:[a-z]{1,4}\.\s*)+', '', defn, flags=re.I).strip()
        clean_defn = clean_defn[:300].strip()
        if clean_defn:
            dictionary[word] = {
                "word": word,
                "partOfSpeech": pos,
                "definition": clean_defn
            }

# 2. Add other literary words from raw_dict until ~10,000 words
for k, v in raw_dict.items():
    if len(dictionary) >= 10000:
        break
    word = k.lower().strip()
    if word not in dictionary and re.match(r'^[a-z]{3,20}$', word):
        defn = v.strip()
        pos = parse_pos(defn)
        clean_defn = re.sub(r'^(?:[a-z]{1,4}\.\s*)+', '', defn, flags=re.I).strip()
        clean_defn = clean_defn[:300].strip()
        if len(clean_defn) > 10:
            dictionary[word] = {
                "word": word,
                "partOfSpeech": pos,
                "definition": clean_defn
            }

print(f"Compiled {len(dictionary)} dictionary words into {TARGET_PATH}")
with open(TARGET_PATH, "w", encoding="utf-8") as f:
    json.dump(dictionary, f, ensure_ascii=False)

file_size = os.path.getsize(TARGET_PATH)
print(f"Generated dictionary.json: {file_size} bytes ({file_size / 1024:.1f} KB)")
