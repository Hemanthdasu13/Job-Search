"""Does Adzuna pagination actually walk pages, and stop early when short?"""
import json, sys, types, io, contextlib, re, collections
for n in ("google","google.colab"): sys.modules.setdefault(n, types.ModuleType(n))
colab=sys.modules["google.colab"]
colab.files=types.SimpleNamespace(download=lambda p:None); colab.userdata=types.SimpleNamespace(get=lambda n:None)
sys.modules["google"].colab=colab
sys.modules["google.colab.files"]=colab.files; sys.modules["google.colab.userdata"]=colab.userdata

CALLS = []
PAGE_DEPTH = {"nl": 5, "pl": 2}   # nl has plenty, pl runs out after page 2

class Resp:
    def __init__(self, n): self._n = n
    status_code = 200
    def raise_for_status(self): pass
    def json(self):
        return {"results": [{"title": f"Role {i}", "company": {"display_name": "X"},
                             "location": {"display_name": "Amsterdam"},
                             "description": "d", "redirect_url": f"http://x/{i}",
                             "created": "2026-10-01"} for i in range(self._n)]}

def fake_get(url, *a, **k):
    m = re.search(r"/jobs/(\w+)/search/(\d+)", url)
    country, page = m.group(1), int(m.group(2))
    CALLS.append((country, page))
    depth = PAGE_DEPTH.get(country, 0)
    return Resp(50 if page <= depth else (7 if page == depth + 1 else 0))

fake=types.ModuleType("requests")
fake.get=fake_get; fake.post=lambda *a,**k: Resp(0)
fake.utils=types.SimpleNamespace(quote=lambda s,safe="": str(s).replace(" ","%20"))
fake.HTTPError=Exception
fake.Session=lambda: types.SimpleNamespace(get=fake_get, post=lambda *a,**k: Resp(0), cookies=[])
sys.modules["requests"]=fake
import time as _t; _t.sleep=lambda *a,**k: None

nb=json.load(open("international.ipynb",encoding="utf-8"))
def source(i):
    s="".join(nb["cells"][i]["source"])
    return "\n".join("pass" if l.strip().startswith("!") else l for l in s.split("\n"))
ns={"__name__":"__main__"}
with contextlib.redirect_stdout(io.StringIO()):
    for i in (1,2): exec(compile(source(i),f"c{i}","exec"),ns)
    # only the function definitions from cell 3, not its driver
    c3 = source(3)
    exec(compile(c3[:c3.index("\na = fetch_adzuna_all_markets(kw)") if "\na = fetch_adzuna_all_markets(kw)" in c3 else len(c3)], "c3", "exec"), ns)

print(f"RESULTS_PER_SOURCE={ns['RESULTS_PER_SOURCE']}  ADZUNA_PAGES={ns['ADZUNA_PAGES']}")
CALLS.clear()
rows = ns["fetch_adzuna_all_markets"]("commercial operations manager")
by_country = collections.Counter(c for c, _ in CALLS)
print(f"\nrows returned: {len(rows)}")
print("pages requested per country:")
for country in sorted(by_country):
    pages = sorted(p for c, p in CALLS if c == country)
    print(f"  {country}: pages {pages}")

problems = []
nl_pages = sorted(p for c, p in CALLS if c == "nl")
pl_pages = sorted(p for c, p in CALLS if c == "pl")
if nl_pages != [1, 2, 3]:
    problems.append(f"nl should walk to ADZUNA_PAGES (3), got {nl_pages}")
if pl_pages != [1, 2, 3]:
    problems.append(f"pl has 2 full pages then a short one, so 3 calls expected, got {pl_pages}")
# a country with nothing must cost exactly one call
if sorted(p for c, p in CALLS if c == "de") != [1]:
    problems.append("an empty market should cost exactly one call, not ADZUNA_PAGES")
# nl: 3 full pages (capped before its short page) = 150
# pl: 2 full pages + 1 short     = 107
# be/de/es/fr: one short page each = 4 x 7 = 28
expected = 50*3 + (50*2 + 7) + 4*7
if len(rows) != expected:
    problems.append(f"row total {len(rows)} != expected {expected}")

print()
if problems:
    for p in problems: print("  !!", p)
    raise SystemExit(1)
print("pagination walks pages, stops the moment a page comes back short,")
print("and an empty market still costs exactly one call")
