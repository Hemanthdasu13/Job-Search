

# ── TARGET MARKETS (INTERNATIONAL BUILD) ─────────────────────────────────────
# See README_INTERNATIONAL.md for why the order is what it is. Short version:
# markets are ranked by how reachable they actually are for an Indian national
# with a UK MBA, no EU status and no local language - not by market size,
# because thin competition is worthless when the gate is work authorisation
# rather than candidate quality.
#
# NOTHING HERE IS IMMIGRATION ADVICE. "route" names the permit people normally
# use and "gate" says what it turns on, so you know what to go and verify.
#
# adzuna: country code for api.adzuna.com/v1/api/jobs/<code>/search. One key
# covers all of them. "" means Adzuna has no endpoint for that country, so the
# market runs on employer ATS sites and LinkedIn only and returns fewer rows.
# That is a COVERAGE limit, not a thin market - do not read it as "no jobs".

MARKETS = {
    "UAE": dict(
        rank=1, adzuna="", english_working=True, where="Dubai",
        cities=["dubai", "abu dhabi", "sharjah", "difc", "united arab emirates", "uae"],
        route="Employer-sponsored work permit and residence visa",
        gate="Employer applies; routine and fast. No points test, no European-style "
             "salary threshold, no language requirement.",
    ),
    "Ireland": dict(
        rank=2, adzuna="", english_working=True, where="Dublin",
        cities=["dublin", "cork", "galway", "limerick", "ireland"],
        route="Critical Skills Employment Permit, or General Employment Permit",
        gate="Turns on the occupation being on the eligible list plus a salary floor. "
             "Check the current list - it moves.",
    ),
    "Netherlands": dict(
        rank=3, adzuna="nl", english_working=True, where="Netherlands",
        cities=["amsterdam", "rotterdam", "utrecht", "the hague", "den haag",
                "eindhoven", "groningen", "tilburg", "amstelveen", "netherlands", "holland"],
        route="Highly Skilled Migrant via an IND-recognised sponsor, or the "
              "Orientation Year (zoekjaar) permit",
        gate="Highly Skilled Migrant needs the employer on the IND public register AND "
             "a salary threshold that STEPS UP SHARPLY AT AGE 30. Check which side of "
             "that line you are on before you plan around this market. The Orientation "
             "Year is the one to verify first: open to graduates of highly-ranked "
             "non-Dutch universities within a few years of graduating, and it carries a "
             "year of unrestricted work rights with no employer sponsorship at all.",
    ),
    "Poland": dict(
        rank=4, adzuna="pl", english_working=True, where="Poland",
        cities=["warsaw", "warszawa", "krakow", "kraków", "cracow", "wroclaw", "wrocław",
                "gdansk", "gdańsk", "poznan", "poznań", "katowice", "lodz", "poland"],
        route="Employer-applied work permit, or EU Blue Card",
        gate="Thresholds materially lower than Western Europe, and service-centre "
             "employers hire non-EU staff routinely because they cannot fill locally. "
             "Salaries are lower in absolute terms - good locally, well below UK.",
    ),
    "Portugal": dict(
        rank=5, adzuna="", english_working=True, where="Lisbon",
        cities=["lisbon", "lisboa", "porto", "braga", "portugal"],
        route="Highly Qualified Activity residence permit, or EU Blue Card",
        gate="Employer-applied. Lisbon and Porto have fast-growing shared-service and "
             "fintech hubs that operate in English. Pay is low by Western European "
             "standards.",
    ),
    "Spain": dict(
        rank=6, adzuna="es", english_working=False, where="Spain",
        cities=["madrid", "barcelona", "valencia", "seville", "sevilla", "malaga",
                "bilbao", "spain"],
        route="Highly Qualified Professional permit, or EU Blue Card",
        gate="Employer-applied, salary thresholds, role must be genuinely qualified. "
             "Barcelona and Madrid service hubs run in English; most other commercial "
             "roles will want Spanish.",
    ),
    "Germany": dict(
        rank=7, adzuna="de", english_working=False, where="Germany",
        cities=["berlin", "munich", "münchen", "muenchen", "frankfurt", "hamburg",
                "cologne", "köln", "duesseldorf", "düsseldorf", "stuttgart",
                "leipzig", "germany"],
        route="EU Blue Card, or the Opportunity Card route",
        gate="Blue Card needs a recognised degree plus a salary threshold, lower for "
             "shortage occupations. For commercial roles the real gate is German, not "
             "the permit.",
    ),
    "France": dict(
        rank=8, adzuna="fr", english_working=False, where="France",
        cities=["paris", "lyon", "marseille", "toulouse", "lille", "bordeaux",
                "nantes", "france"],
        route="Passeport Talent, or EU Blue Card",
        gate="Passeport Talent is relatively employer-friendly for qualified hires. "
             "French is usually real for commercial roles outside tech.",
    ),
    "Belgium": dict(
        rank=9, adzuna="be", english_working=False, where="Belgium",
        cities=["brussels", "bruxelles", "antwerp", "antwerpen", "ghent", "gent",
                "leuven", "belgium"],
        route="Single Permit (combined work and residence)",
        gate="Regional, employer-applied, salary thresholds per region. Brussels "
             "institutional and EU-facing roles often run in English.",
    ),
}

# Service-centre cities where English is usually the operating language and the
# work is commercial operations, process redesign and transformation - the
# closest match anywhere to what he actually ran at Axis and HDFC.
GBS_HUBS = {
    "krakow", "kraków", "cracow", "warsaw", "warszawa", "wroclaw", "wrocław",
    "gdansk", "gdańsk", "katowice", "poznan", "poznań", "lodz",
    "budapest", "prague", "praha", "brno", "bucharest", "bucuresti",
    "lisbon", "lisboa", "porto", "dublin", "amsterdam", "rotterdam",
    "barcelona", "madrid", "sofia", "bratislava", "vilnius", "riga", "tallinn",
}

# Optional. The IND publishes a free public register of recognised sponsors -
# employers that have already done the paperwork and demonstrably hire non-EU
# staff. That is the ONLY hard signal anywhere about who will sponsor, because
# no advert ever says so. Download it, put it in Drive, and point this at it.
# Leave blank and the column reads "register not loaded" rather than guessing.
SPONSOR_REGISTER_CSV = ""   # e.g. "/content/drive/MyDrive/ind_recognised_sponsors.csv"

# Everything the targeted markets are not. Keeps the UK out of this notebook -
# the UK one already covers it, including Scotland and Wales.
EXCLUDED_LOCATIONS = [
    "united kingdom", " uk,", "(uk)", "england", "scotland", "wales",
    "northern ireland", "london", "manchester", "edinburgh", "glasgow",
    "birmingham", "bristol", "leeds", "cardiff", "belfast", "coventry",
    "united states", " usa", " us,", "u.s.", "canada", "australia", "japan",
    "india", "mexico", "brazil", "new york", "san francisco", "seattle",
    "boston", "los angeles", "chicago", "dallas", "austin", "tokyo", "sydney",
    "melbourne", "toronto", "shanghai", "beijing", "hong kong", "seoul",
    "gurugram", "gurgaon", "mumbai", "bangalore", "bengaluru", "hyderabad",
    "delhi", "pune", "chennai", "kolkata", "noida",
    "sao paulo", "são paulo", "santiago", "buenos aires", "bogota",
    "nairobi", "cairo", "manila", "taiwan", "johannesburg",
    "remote - us", "remote us", "remote (us)",
]

# Positive evidence that a row is in a market we actually want.
TARGET_LOCATIONS = sorted({c for cfg in MARKETS.values() for c in cfg["cities"]}
                          | {name.lower() for name in MARKETS})

# The seven location gates inherited from the UK notebook read these two names.
# Redefining the DATA inverts all of them at once; renaming seven functions
# across six cells is how you miss a call site.
NON_UK = EXCLUDED_LOCATIONS
UK_LOCATION_SIGNALS = TARGET_LOCATIONS

print(f"International build: {len(MARKETS)} markets, "
      f"{sum(1 for c in MARKETS.values() if c['adzuna'])} covered by Adzuna, "
      f"{sum(1 for c in MARKETS.values() if not c['adzuna'])} on ATS/LinkedIn only.")
print("  " + ", ".join(f"{n}({c['rank']})" for n, c in
                       sorted(MARKETS.items(), key=lambda kv: kv[1]["rank"])))
print(f"  Sponsor register: {'loaded from ' + SPONSOR_REGISTER_CSV if SPONSOR_REGISTER_CSV else 'not loaded - see README'}")
