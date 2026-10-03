import json, re, sys, pathlib

HERE = pathlib.Path(__file__).parent
UK   = pathlib.Path("/home/user/Job-Search/HEMANTH_ROLE_DISCOVERY_WORKFLOW.ipynb")
OUT  = HERE / "international.ipynb"

def read(name): return (HERE / name).read_text(encoding="utf-8")

nb = json.loads(UK.read_text(encoding="utf-8"))
cells = nb["cells"]
def src(i): return "".join(cells[i]["source"])
def setsrc(i, text):
    cells[i]["source"] = text.splitlines(keepends=True)
    cells[i]["outputs"] = []; cells[i]["execution_count"] = None

report = []
def sub(text, pattern, repl, count, label, flags=0):
    new, n = re.subn(pattern, lambda m: repl, text, count=count, flags=flags)
    assert n == count, f"{label}: expected {count} match(es), got {n}"
    report.append(label)
    return new

# ── cell 1: market config replaces the UK location lists ─────────────────────
c1 = src(1)
c1 = sub(c1, r'CANDIDATE_SLUG\s*=\s*"[^"]+"', 'CANDIDATE_SLUG = "hemanth_international"',
         1, "cell 1: workbook names retargeted via the slug")
c1 = c1.rstrip("\n") + "\n" + read("i_config.py")
setsrc(1, c1)

# ── cell 2: language detector, annotation, and the country gate ──────────────
c2 = src(2)
c2 = sub(c2, r"NON_UK_COUNTRIES\s*=\s*\{[^}]*\}",
         "# Countries to drop outright. The UK is excluded here because the UK\n"
         "# notebook already covers it, Scotland and Wales included.\n"
         'NON_UK_COUNTRIES = {"UK", "USA", "India", "Canada", "Australia", "Japan",\n'
         '                    "Brazil", "Mexico", "China", "South Africa"}',
         1, "cell 2: country gate retargeted", re.S)
c2 = c2.rstrip("\n") + "\n" + read("i_language.py").replace("import re\n", "", 1) \
     + read("i_annotate.py")
setsrc(2, c2)

# ── cell 3: Adzuna loops over the market country codes ───────────────────────
c3 = src(3)
old_url = '''        f"https://api.adzuna.com/v1/api/jobs/gb/search/1"'''
assert old_url in c3
c3 = c3.replace('''def fetch_adzuna(keyword):
    jobs = []
    url = (''' + '\n' + old_url, '''def fetch_adzuna(keyword, country="gb", where=""):
    """One keyword against one country. Adzuna exposes a separate endpoint per
    country and a single key covers all of them, so the only thing that changes
    between a UK search and a Dutch one is two characters in the path."""
    jobs = []
    url = (
        f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"''', 1)
c3 = c3.replace('f"&where={requests.utils.quote(LOCATION)}"',
                'f"&where={requests.utils.quote(where)}"', 1)
c3 = c3.replace('"source":  "Adzuna",', '"source":  f"Adzuna {country.upper()}",', 1)

# Reed is a UK-only board. Keeping it would spend a call per keyword to collect
# rows the location filter then throws away.
c3 = c3.replace("def fetch_reed(keyword):", '''def fetch_reed(keyword):
    # Reed covers the UK only. In the international build it is a no-op rather
    # than a call per keyword whose rows the location filter then discards.
    return []


def _fetch_reed_uk_unused(keyword):''', 1)

ALL_MARKETS = '''

def fetch_adzuna_all_markets(keyword):
    """Every Adzuna-covered market for one keyword. Markets with no Adzuna
    endpoint are served by the ATS and LinkedIn cells instead, so a market
    missing from this loop is a coverage gap, not an empty market."""
    out = []
    for name, cfg in sorted(MARKETS.items(), key=lambda kv: kv[1]["rank"]):
        if not cfg["adzuna"]:
            continue
        found = fetch_adzuna(keyword, cfg["adzuna"], cfg["where"])
        out.extend(found)
    return out


'''
# Insert it before fetch_reed so it exists by the time the driver in this same
# cell runs, then point the driver at it.
c3 = sub(c3, r"def fetch_reed\(keyword\):", ALL_MARKETS.lstrip("\n") + "def fetch_reed(keyword):",
         1, "cell 3: all-markets helper defined before the driver")
c3 = sub(c3, r"a = fetch_adzuna\(kw\)", "a = fetch_adzuna_all_markets(kw)",
         1, "cell 3: driver searches every market")
setsrc(3, c3)
report.append("cell 3: Adzuna per-country loop, Reed disabled")

# ── every other NON_UK / UK_LOCATIONS definition points at the one source ────
for idx in (4, 7):
    c = src(idx)
    c = sub(c, r"NON_UK = \[.*?\]",
            "NON_UK = EXCLUDED_LOCATIONS  # single source, cell 1",
            1, f"cell {idx}: NON_UK deduplicated", re.S)
    setsrc(idx, c)

for idx in (10, 11):
    c = src(idx)
    c = sub(c, r"UK_LOCATIONS = \[.*?\]",
            "UK_LOCATIONS = TARGET_LOCATIONS  # single source, cell 1",
            1, f"cell {idx}: UK_LOCATIONS deduplicated", re.S)
    setsrc(idx, c)

# ── the keyword driver uses the multi-market fetch ───────────────────────────
for idx in range(3, 14):
    c = src(idx)
    if "fetch_adzuna(" in c and "def fetch_adzuna" not in c:
        c = c.replace("fetch_adzuna(", "fetch_adzuna_all_markets(")
        setsrc(idx, c)
        report.append(f"cell {idx}: driver calls every market")

# ── cell 14: its own state store, so the UK run is untouched ─────────────────
c14 = src(14)
c14 = sub(c14, r'STATE_DIR\s*=\s*"[^"]+"', 'STATE_DIR = "./international_state"',
          1, "cell 14: separate state store")
setsrc(14, c14)

# ── cell 15: annotate, add columns, split the sheets ─────────────────────────
c15 = src(15)
# STRICT_NON_UK_TERMS lists exactly the cities this notebook is FOR - it is the
# UK build's foreign-city blocklist. The ATS and LinkedIn paths use it, and UAE,
# Ireland and Portugal have no Adzuna endpoint, so leaving it would have made
# those three markets silently return nothing at all.
c15 = sub(c15, r"STRICT_NON_UK_TERMS = \[.*?\]",
          "STRICT_NON_UK_TERMS = EXCLUDED_LOCATIONS  # single source, cell 1",
          1, "cell 15: strict blocklist retargeted", re.S)

c15 = sub(c15, r"deduped = annotate_contract_fields\(deduped\)",
          "deduped = annotate_contract_fields(deduped)\n"
          "\n"
          "# Market, language gate, permit route and rare-fit signal.\n"
          "deduped = annotate_international_fields(deduped)",
          1, "cell 15: international annotation")

c15 = sub(c15, r'    "Contract Type", "Term", "Start Friction", "Start Friction Why",',
          '    "Market", "Language Gate", "Worth Sponsoring?", "Service Hub",\n'
          '    "Recognised Sponsor", "Permit Route", "Permit Gate", "Language Note",\n'
          '    "Language Evidence", "Market Rank",\n'
          '    "Contract Type", "Term", "Start Friction", "Start Friction Why",',
          1, "cell 15: international columns")

c15 = sub(c15, r'WRAP_COLUMNS = \{\n    "Why New", "Start Friction Why",',
          'WRAP_COLUMNS = {\n    "Why New", "Start Friction Why", "Language Note",\n'
          '    "Permit Gate", "Worth Sponsoring?",',
          1, "cell 15: wrap the new prose columns")

# the decision sheets
c15 = sub(c15, r'df_contract     = _frame\(_contract_rows, cols\)',
          'df_contract     = _frame(_contract_rows, cols)\n'
          '\n'
          '# The sheet to actually work from. A role whose advert REQUIRES a language\n'
          '# he does not have is not a near miss, it is a no, so it is kept off the\n'
          '# working list rather than ranked low on it.\n'
          '_gated   = [r for r in deduped if str(r.get("Language Gate","")).startswith("Gate:")]\n'
          '_open    = [r for r in deduped if r not in _gated]\n'
          '_rare    = [r for r in _open if str(r.get("Worth Sponsoring?","")).startswith("Rare fit")]\n'
          'df_open     = _frame(_open, cols)\n'
          'df_gated    = _frame(_gated, cols)\n'
          'df_rare     = _frame(_rare, cols)',
          1, "cell 15: language-gate split")

c15 = sub(c15, r'    df_contract\.to_excel\(writer, index=False, sheet_name="Contract Roles"\)',
          '    df_open.to_excel(writer, index=False, sheet_name="No Language Gate")\n'
          '    df_rare.to_excel(writer, index=False, sheet_name="Rare Fit - Best Odds")\n'
          '    df_gated.to_excel(writer, index=False, sheet_name="Language Gated")\n'
          '    df_contract.to_excel(writer, index=False, sheet_name="Contract Roles")',
          1, "cell 15: three new sheets")

c15 = sub(c15, r'print\("  Start Friction reads the two visa dates set in cell 2\. Correct them there\."\)',
          'print("  Start Friction reads the two visa dates set in cell 2. Correct them there.")\n'
          'print()\n'
          'print("By market")\n'
          'print("-" * 55)\n'
          'for _name, _cfg in sorted(MARKETS.items(), key=lambda kv: kv[1]["rank"]):\n'
          '    _rows = [r for r in deduped if r.get("Market") == _name]\n'
          '    if not _rows:\n'
          '        continue\n'
          '    _g = sum(1 for r in _rows if str(r.get("Language Gate","")).startswith("Gate:"))\n'
          '    _r = sum(1 for r in _rows if str(r.get("Worth Sponsoring?","")).startswith("Rare fit"))\n'
          '    print(f"  {_cfg[\'rank\']}. {_name:<14}{len(_rows):>5} roles | "\n'
          '          f"{len(_rows)-_g:>4} with no language gate | {_r:>4} rare fit")\n'
          '_unmatched = sum(1 for r in deduped if r.get("Market") == "Unmatched")\n'
          'if _unmatched:\n'
          '    print(f"  (+{_unmatched} rows whose location matched no configured market)")\n'
          'print()\n'
          'print("  Work from \'Rare Fit - Best Odds\' first, then \'No Language Gate\'.")\n'
          'print("  A market needs an employer to do paperwork, so the only roles worth")\n'
          'print("  the effort are ones where you are plainly the best candidate.")',
          1, "cell 15: per-market summary")
setsrc(15, c15)

# ── cell 16: the screener needs to know the market and the gate ──────────────
c16 = src(16)
c16 = sub(c16, r'"contract_type": row\.get\("Contract Type", "Not stated"\),',
          '"market": row.get("Market", ""),\n'
          '            "language_gate": row.get("Language Gate", ""),\n'
          '            "permit_route": row.get("Permit Route", ""),\n'
          '            "contract_type": row.get("Contract Type", "Not stated"),',
          1, "cell 16: market context to the model")

c16 = sub(c16, r"CONTRACT AND FIXED-TERM ROLES:",
          """NON-UK ROLES - READ THIS BEFORE SCORING ONE:
- The candidate's Graduate visa covers the UK only. Every role here needs an
  employer to sponsor a permit, or a separate right to work. That paperwork is
  a real cost to the employer, and an EU national applying to the same advert
  carries none of it.
- So the question is not "could he do this job". It is "is he so clearly the
  best available candidate that an employer will do the paperwork". Score for
  that. A competent generic fit in Amsterdam is weaker than a rare specific
  fit, because the generic fit loses to a local.
- Say explicitly what this employer cannot get from the local candidate pool.
  If you cannot name something, say so and score it down - that is the honest
  answer and it saves an application.
- Where a language is REQUIRED by the advert and the candidate does not have
  it, that is an essential gap. Say so plainly. Where it is only desirable, it
  is not a gap - do not inflate it into one.
- The MBA helps him get the interview. It is not what unlocks a permit; his
  engineering degree already satisfies the degree requirement on most routes.
  Do not present the MBA as solving the visa question.

CONTRACT AND FIXED-TERM ROLES:""", 1, "cell 16: international rubric")
setsrc(16, c16)

nb["cells"] = cells
OUT.write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
print("\n".join(" - " + r for r in report))
print(f"\nWrote {OUT.name} with {len(cells)} cells")
