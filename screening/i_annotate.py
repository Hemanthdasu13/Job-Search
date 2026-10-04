

# ── MARKET, LANGUAGE AND AUTHORISATION ANNOTATION ────────────────────────────

def market_for_location(location, country=""):
    text = re.sub(r"\s+", " ", f"{location} {country}".lower())
    best = None
    for name, cfg in sorted(MARKETS.items(), key=lambda kv: kv[1]["rank"]):
        if re.search(rf"\b{re.escape(name.lower())}\b", text):
            return name
        for city in cfg["cities"]:
            if re.search(rf"\b{re.escape(city)}\b", text):
                best = best or name
    return best or ""


def is_gbs_hub(location):
    text = re.sub(r"\s+", " ", str(location or "").lower())
    return any(re.search(rf"\b{re.escape(h)}\b", text) for h in GBS_HUBS)


_SPONSOR_NAMES = None

def _load_sponsor_register():
    """Employers on the IND public register have already sponsored non-EU staff.
    No advert states this, so the register is the only hard signal available."""
    global _SPONSOR_NAMES
    if _SPONSOR_NAMES is not None:
        return _SPONSOR_NAMES
    _SPONSOR_NAMES = set()
    if SPONSOR_REGISTER_CSV:
        try:
            frame = pd.read_csv(SPONSOR_REGISTER_CSV)
            col = next((c for c in frame.columns
                        if "name" in str(c).lower() or "organisation" in str(c).lower()),
                       frame.columns[0])
            _SPONSOR_NAMES = {normalise_text(v) for v in frame[col].dropna()}
            print(f"  Sponsor register: {len(_SPONSOR_NAMES)} recognised sponsors loaded.")
        except Exception as error:
            print(f"  Sponsor register could not be read ({error}). Column will read 'register not loaded'.")
    return _SPONSOR_NAMES


def sponsor_status(company):
    names = _load_sponsor_register()
    if not names:
        return "Register not loaded"
    c = normalise_text(company)
    if not c:
        return "Unknown"
    first = c.split()[0] if c.split() else ""
    for name in names:
        if c == name or (len(first) > 4 and name.startswith(first)):
            return "On IND register"
    return "Not on IND register"


def annotate_international_fields(rows):
    for r in rows:
        location = r.get("Location", "")
        market = market_for_location(location, r.get("Country", ""))
        cfg = MARKETS.get(market, {})

        jd = r.get("Job Description", "")
        status, language, evidence = detect_language_requirement(r.get("Title", ""), jd)
        verdict, explain = language_verdict(status, language)

        # An advert written in the local language is the strongest evidence there
        # is that the job is done in that language, and no sentence in it will
        # say so. Treated as a gate, but labelled as inference not quotation.
        advert_lang, share = advert_language_guess(jd)
        r["Advert Language"] = advert_lang or ("English" if len(str(jd)) > 400 else "")
        if advert_lang and status != "REQUIRED":
            verdict = f"Gate: advert written in {advert_lang}"
            explain = (f"{int(share * 100)} percent of this advert is {advert_lang} "
                       f"function words. Nothing in it states a language requirement, "
                       f"but an advert written in {advert_lang} is a job done in "
                       f"{advert_lang}. Inferred, not quoted.")
            evidence = evidence or f"{advert_lang} stopword share {share}"

        # Enrichment status, so a thin row is never mistaken for a clean one.
        chars = len(str(jd).strip())
        r["Advert Length"] = chars
        r["Advert Complete?"] = (
            "Full advert" if chars >= 1200 else
            "Partial" if chars >= ENRICH_MIN_CHARS else
            "SNIPPET ONLY - score and language gate are both unreliable")

        r["Market"] = market or "Unmatched"
        r["Market Rank"] = cfg.get("rank", 99)
        r["Language Gate"] = verdict
        r["Language Note"] = explain
        r["Language Evidence"] = evidence
        r["Permit Route"] = cfg.get("route", "")
        r["Permit Gate"] = cfg.get("gate", "")
        r["Service Hub"] = "Yes" if is_gbs_hub(location) else ""
        r["Recognised Sponsor"] = (sponsor_status(r.get("Company", ""))
                                   if market == "Netherlands" else "")
        # The only roles worth an application in a market that needs sponsorship
        # are ones where you are plainly the best candidate available. Generic
        # fits lose to an EU national who needs no paperwork.
        r["Worth Sponsoring?"] = rarity_signal(r)
    return rows


# Signals that a role wants something an EU national pool is unlikely to supply.
# This is the argument an employer has to be able to make to justify the
# paperwork, so it is the thing to look for rather than breadth of match.
_RARITY_SIGNALS = [
    ("emerging market", "emerging-market operating experience"),
    ("india", "India market experience"),
    ("south asia", "South Asia experience"),
    ("gcc", "GCC market experience"),
    ("middle east", "Middle East experience"),
    ("bancassurance", "bancassurance - genuinely rare in Europe"),
    ("retail banking operations", "retail banking operations at scale"),
    ("scale up operations", "scaling an operation from scratch"),
    ("contact centre", "contact-centre operating model"),
    ("shared service", "shared-service / GBS operating model"),
    ("global business services", "shared-service / GBS operating model"),
    ("process redesign", "process redesign"),
    ("target operating model", "target operating model work"),
    ("regulated", "regulated-industry experience"),
    ("price control", "regulatory price-control work"),
    ("hydrogen", "published research on this exact area"),
    ("transmission", "published research on network infrastructure"),
    ("ai adoption", "AI adoption - dissertation subject"),
    ("ai strategy", "AI strategy - dissertation subject"),
    ("human-ai", "human-AI decision design - dissertation subject"),
    ("go to market", "Moasure GTM project"),
    ("go-to-market", "Moasure GTM project"),
    ("market sizing", "TAM/SAM/SOM sizing from the Moasure project"),
]


def rarity_signal(row):
    text = normalise_text(f"{row.get('Title','')} {row.get('Job Description','')}")
    hits = []
    for needle, label in _RARITY_SIGNALS:
        if needle in text and label not in hits:
            hits.append(label)
    if not hits:
        return "No rare-fit signal - likely loses to a local candidate"
    return "Rare fit: " + "; ".join(hits[:4])


# ── COUNTRY MAP: the silent filter that nearly sank this build ───────────────
# get_country_continent() defaults any city it does not recognise to "UK", and
# cell 15 drops every row whose country is in NON_UK_COUNTRIES - which, in this
# notebook, includes the UK. The result was that Utrecht, Rotterdam, Krakow and
# Gdansk were resolving to "UK" and being binned without a word: four of the
# target markets' main cities, Krakow among them, which is the single most
# important city in the Poland case.
#
# The market config already lists every city we care about, so it is the right
# source of truth. Consult it first and only fall through to the original map.
_MARKET_CITY_COUNTRY = {}
for _name, _cfg in MARKETS.items():
    for _city in _cfg["cities"]:
        _MARKET_CITY_COUNTRY.setdefault(_city, _name)

_CONTINENT_FOR = {"UAE": "Middle East"}
_country_continent_base = get_country_continent


def get_country_continent(location):
    text = normalise_text(location)
    if text:
        for _city, _country in _MARKET_CITY_COUNTRY.items():
            if re.search(rf"\b{re.escape(_city)}\b", text):
                return _country, _CONTINENT_FOR.get(_country, "Europe")
    return _country_continent_base(location)


_unresolved = [c for c in _MARKET_CITY_COUNTRY
               if get_country_continent(c)[0] != _MARKET_CITY_COUNTRY[c]]
assert not _unresolved, f"cities not resolving to their own market: {_unresolved}"
print(f"Country map extended: {len(_MARKET_CITY_COUNTRY)} market cities resolve to "
      f"their own country, not to the UK default.")
