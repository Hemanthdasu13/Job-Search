"""Mixed international + UK rows: right market, right sheet, UK kept out."""
import json, sys, types, os, io, contextlib, shutil
os.chdir(os.path.dirname(os.path.abspath(__file__)))
shutil.rmtree("./international_state", ignore_errors=True)

colab=types.ModuleType("google.colab"); fm=types.ModuleType("f"); fm.download=lambda p: None
um=types.ModuleType("u"); um.get=lambda n: None
colab.files, colab.userdata = fm, um
g=types.ModuleType("google"); g.colab=colab
sys.modules.update({"google":g,"google.colab":colab,"google.colab.files":fm,"google.colab.userdata":um})
fake=types.ModuleType("requests")
def _boom(*a,**k): raise RuntimeError("network blocked")
fake.get=_boom; fake.post=_boom
fake.utils=types.SimpleNamespace(quote=lambda s,safe="": str(s).replace(" ","%20"))
fake.HTTPError=Exception; fake.Session=lambda: types.SimpleNamespace(get=_boom,post=_boom,cookies=[])
sys.modules["requests"]=fake
import time as _t; _t.sleep=lambda *a,**k: None

nb=json.load(open("international.ipynb",encoding="utf-8"))
def source(i):
    s="".join(nb["cells"][i]["source"])
    return "\n".join("pass" if l.strip().startswith("!") else l for l in s.split("\n"))

BASE = ("Own the commercial operating model across distribution. Run root-cause analysis on "
        "conversion, build business cases through Risk and Compliance, lead a team and present "
        "to the executive committee. Seven years of experience. MBA welcome. ")

def job(title, company, loc, desc, url):
    return {"title":title,"company":company,"location":loc,"salary":"","posted":"",
            "desc":desc,"url":url,"source":"Adzuna NL"}

ROWS = [
    # market, language expectation
    ("Commercial Operations Manager","ING","Amsterdam, Netherlands",
     BASE + "Our working language is English.", "Netherlands", "English stated"),
    ("Shared Service Lead","Capgemini","Kraków, Poland",
     BASE + "Global business services centre. Process redesign across markets.",
     "Poland", "Language not stated"),
    ("Strategy Manager","Emirates NBD","Dubai - DIFC",
     BASE + "Retail banking operations and bancassurance across the GCC.",
     "UAE", "Language not stated"),
    ("Business Partner","Stripe","Dublin 2",
     BASE + "Emerging market expansion.", "Ireland", "Language not stated"),
    ("Commercial Manager","Rabobank","Utrecht",
     BASE + "Fluent Dutch is required.", "Netherlands", "Gate: Dutch required"),
    ("Transformation Lead","Allianz","Munich, Germany",
     BASE + "Fluency in German is essential.", "Germany", "Gate: German required"),
    ("Operations Manager","Siemens","Berlin",
     BASE + "German is a plus but not required.", "Germany", "German preferred, not required"),
    # must be EXCLUDED - the UK notebook covers these
    ("Strategy Manager","Barclays","London, UK", BASE, None, None),
    ("Commercial Lead","NatWest","Edinburgh, Scotland", BASE, None, None),
    ("Analyst","Infosys","Bangalore, India", BASE, None, None),
]

board = [job(t, c, l, d, f"https://www.adzuna.nl/jobs/land/ad/7000{i}?se=Z{i}")
         for i, (t, c, l, d, _, _) in enumerate(ROWS)]

ns={"__name__":"__main__"}
for i in (1,2): exec(compile(source(i),f"c{i}","exec"),ns)
ns["board_jobs"]=board; ns["company_jobs"]=[]; ns["linkedin_jobs"]=[]
with contextlib.redirect_stdout(io.StringIO()):
    for i in (13,14,15):
        exec(compile(source(i),f"c{i}","exec"),ns)

rows = {r["Title"] + "|" + r["Company"]: r for r in ns["deduped"]}
print(f"collected {len(ns['deduped'])} of {len(ROWS)} submitted\n")
print(f"{'market':<14}{'language gate':<32}{'hub':<5}title")
print("-"*104)
problems = []
for t, c, l, d, want_market, want_lang in ROWS:
    key = t + "|" + c
    r = rows.get(key)
    if want_market is None:
        if r: problems.append(f"{t} @ {l} should have been excluded but is present")
        print(f"{'(excluded)':<14}{'-':<32}{'-':<5}{t} @ {l}")
        continue
    if not r:
        problems.append(f"{t} @ {l} is missing - expected market {want_market}")
        print(f"{'MISSING':<14}{'-':<32}{'-':<5}{t} @ {l}")
        continue
    got_m, got_l = r.get("Market"), r.get("Language Gate")
    if got_m != want_market: problems.append(f"{t}: market {got_m} != {want_market}")
    if got_l != want_lang:   problems.append(f"{t}: language {got_l!r} != {want_lang!r}")
    print(f"{got_m:<14}{got_l:<32}{r.get('Service Hub') or '-':<5}{t}")

import openpyxl
wb = openpyxl.load_workbook(ns["output_file"])
print(f"\nsheets: {wb.sheetnames}")
def n(s): return wb[s].max_row - 1
print(f"  No Language Gate    {n('No Language Gate')}")
print(f"  Rare Fit - Best Odds{n('Rare Fit - Best Odds'):>4}")
print(f"  Language Gated      {n('Language Gated')}")
if n("Language Gated") != 2:
    problems.append(f"expected 2 language-gated rows, got {n('Language Gated')}")
if n("No Language Gate") + n("Language Gated") != len(ns["deduped"]):
    problems.append("the two sheets do not partition the rows")

# the actual bug he reported: a gated role still appearing as a suggestion
for sheet in ("Jobs", "Rolling Top 20", "New Since Last Run", "Contract Roles"):
    ws = wb[sheet]
    hdr = [c.value for c in ws[1]]
    if "Language Gate" not in hdr:
        continue
    gi = hdr.index("Language Gate") + 1
    ti = hdr.index("Title") + 1
    leaked = [ws.cell(row=r, column=ti).value for r in range(2, ws.max_row + 1)
              if str(ws.cell(row=r, column=gi).value or "").startswith("Gate:")]
    print(f"  {sheet:<22} gated rows present: {len(leaked)} {leaked}")
    if leaked:
        problems.append(f"{sheet} still lists language-gated roles: {leaked}")

print("\n  rare-fit reasons")
ws = wb["Rare Fit - Best Odds"]; hdr=[c.value for c in ws[1]]
ti, wi = hdr.index("Title")+1, hdr.index("Worth Sponsoring?")+1
for r in range(2, ws.max_row+1):
    print(f"    {str(ws.cell(row=r,column=ti).value)[:30]:<32}{ws.cell(row=r,column=wi).value}")

print()
if problems:
    for p in problems: print("  !!", p)
    raise SystemExit(1)
print("markets routed correctly, language gate split clean, UK and India excluded")
