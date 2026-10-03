"""Every configured market city must survive every location gate.
This is the regression guard for the filter that silently binned Krakow."""
import json, sys, types, io, contextlib
for n in ("google","google.colab"): sys.modules.setdefault(n, types.ModuleType(n))
colab=sys.modules["google.colab"]
colab.files=types.SimpleNamespace(download=lambda p:None); colab.userdata=types.SimpleNamespace(get=lambda n:None)
sys.modules["google"].colab=colab
sys.modules["google.colab.files"]=colab.files; sys.modules["google.colab.userdata"]=colab.userdata
fake=types.ModuleType("requests"); fake.get=fake.post=lambda *a,**k: None
fake.utils=types.SimpleNamespace(quote=lambda s,safe="": s); fake.HTTPError=Exception; fake.Session=lambda: None
sys.modules["requests"]=fake
nb=json.load(open("international.ipynb",encoding="utf-8"))
def source(i):
    s="".join(nb["cells"][i]["source"])
    return "\n".join("pass" if l.strip().startswith("!") else l for l in s.split("\n"))
ns={"__name__":"__main__"}
c15 = source(15)
cut = c15.index("# ── UK Visa Sponsor Register")
with contextlib.redirect_stdout(io.StringIO()):
    for s,lbl in ((source(1),"c1"),(source(2),"c2"),(c15[:cut],"c15")):
        exec(compile(s,lbl,"exec"),ns)

bad, total = [], 0
for name,cfg in ns["MARKETS"].items():
    for city in cfg["cities"]:
        total += 1
        loc = city.title()
        country,_ = ns["get_country_continent"](loc)
        gates = (ns["is_uk_loc"](loc), ns["uk_location_ok"](loc), country == name)
        if not all(gates):
            bad.append((name, city, country) + gates)
print(f"checked {total} cities across {len(ns['MARKETS'])} markets")
# and the reverse: UK and Indian cities must still be rejected
leaks = [c for c in ["London","Edinburgh","Cardiff","Manchester","Bangalore","Mumbai",
                     "New York","Toronto","Sydney"]
         if ns["uk_location_ok"](c) and ns["is_uk_loc"](c)]
if bad:
    print("cities a gate still drops:")
    for x in bad: print("   ", x)
if leaks:
    print("locations that should be excluded but pass:", leaks)
assert not bad and not leaks
print("all market cities pass every gate; UK, India and other non-targets still rejected")
