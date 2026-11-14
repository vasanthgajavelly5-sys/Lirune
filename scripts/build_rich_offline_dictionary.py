import json
import os
import re
import urllib.request

DICT_URL = "https://raw.githubusercontent.com/matthewreagan/WebstersEnglishDictionary/master/dictionary_compact.json"
TARGET_PATH = r"c:\Users\vasanth\Desktop\Programs\Epub reader\mobile\assets\dictionary.json"

os.makedirs(os.path.dirname(TARGET_PATH), exist_ok=True)

print("Fetching matthewreagan/WebstersEnglishDictionary...")
req = urllib.request.Request(DICT_URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=40) as resp:
    raw_dict = json.loads(resp.read().decode("utf-8"))

print(f"Loaded {len(raw_dict)} total Webster entries.")

# Load common word list for prioritization
COMMON_WORDS_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt"
try:
    req_comm = urllib.request.Request(COMMON_WORDS_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req_comm, timeout=20) as resp_c:
        common_words = [line.strip().lower() for line in resp_c.read().decode("utf-8").splitlines() if line.strip()]
except Exception as e:
    print(f"Could not load priority list: {e}")
    common_words = []

dictionary = {}

def clean_definition(text):
    # Remove leading numbering like "1. ", "2. "
    t = re.sub(r'^\d+\.\s*', '', text).strip()
    # Remove trailing citation brackets or author names
    t = re.sub(r'\s*\[(?:Obs\.|Colloq\.|R\.|Prov\.\s*Eng\.)\]', '', t)
    # Truncate to reasonable dictionary snippet
    t = t[:300].strip()
    # Normalize clean punctuation
    if not t.endswith('.'):
        t += '.'
    return t

def infer_pos(text):
    tl = text.lower()
    if 'to ' in tl[:15] or 'to make' in tl or 'to enter' in tl or 'to act' in tl:
        return 'verb'
    if 'of or pertaining to' in tl or 'characterized by' in tl or 'having the' in tl or 'able to' in tl:
        return 'adjective'
    if 'in a ' in tl[:15] or 'manner' in tl[:30]:
        return 'adverb'
    return 'noun'

# 1. Process common words
for w in common_words:
    if w in raw_dict:
        raw_def = raw_dict[w]
        defn = clean_definition(raw_def)
        if len(defn) > 10:
            dictionary[w] = {
                "word": w,
                "partOfSpeech": infer_pos(raw_def),
                "definition": defn
            }

print(f"Added {len(dictionary)} common words from priority list.")

# 2. Add remaining entries up to 20,000 words
for w, raw_def in raw_dict.items():
    if len(dictionary) >= 20000:
        break
    wl = w.lower().strip()
    if wl not in dictionary and re.match(r'^[a-z]+(?:-[a-z]+)*$', wl):
        defn = clean_definition(raw_def)
        if len(defn) > 15:
            dictionary[wl] = {
                "word": wl,
                "partOfSpeech": infer_pos(raw_def),
                "definition": defn
            }

print(f"Total compiled dictionary entries: {len(dictionary)}")

# 3. Add modern and essential literary terms
essential_terms = {
    "rabbit": {"word": "rabbit", "partOfSpeech": "noun", "definition": "A burrowing, gregarious, plant-eating mammal with long ears, long hind legs, and a short tail."},
    "computer": {"word": "computer", "partOfSpeech": "noun", "definition": "An electronic device for storing and processing data, typically in binary form, according to instructions given to it."},
    "internet": {"word": "internet", "partOfSpeech": "noun", "definition": "A global computer network providing a variety of information and communication facilities."},
    "ephemeral": {"word": "ephemeral", "partOfSpeech": "adjective", "definition": "Lasting for a very short time; transitory; fleeting.", "synonyms": ["fleeting", "transient", "momentary"]},
    "serendipity": {"word": "serendipity", "partOfSpeech": "noun", "definition": "The occurrence and development of events by chance in a happy or beneficial way.", "synonyms": ["fortune", "fluke", "chance"]},
    "solitude": {"word": "solitude", "partOfSpeech": "noun", "definition": "The state or situation of being alone, especially a pleasant and tranquil one.", "synonyms": ["seclusion", "isolation", "peace"]},
    "sonder": {"word": "sonder", "partOfSpeech": "noun", "definition": "The profound realization that each random passerby is living a life as vivid and complex as your own.", "synonyms": ["empathy", "awareness"]},
    "petrichor": {"word": "petrichor", "partOfSpeech": "noun", "definition": "A pleasant, distinctive smell that frequently accompanies the first rain after a long period of warm, dry weather.", "synonyms": ["earthy scent", "rain fragrance"]},
    "labyrinth": {"word": "labyrinth", "partOfSpeech": "noun", "definition": "An intricate network of passages or paths in which it is difficult to find one's way; a maze.", "synonyms": ["maze", "network", "warren"]}
}

for k, v in essential_terms.items():
    dictionary[k] = v

with open(TARGET_PATH, "w", encoding="utf-8") as f:
    json.dump(dictionary, f, ensure_ascii=False)

sz = os.path.getsize(TARGET_PATH)
print(f"Successfully generated {TARGET_PATH}: {sz} bytes ({sz / 1024:.1f} KB) with {len(dictionary)} words")
