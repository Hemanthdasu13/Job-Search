import re

# ── TARGET MARKETS ───────────────────────────────────────────────────────────
# Ordered by how reachable each market actually is for an Indian national
# holding a UK MBA, no EU status and no local language. That order is the whole
# point: thin competition is worthless if the gate is work authorisation rather
# than candidate quality, and authorisation is the harder gate in the EU.
#
# NOTHING HERE IS IMMIGRATION ADVICE. "route" names the permit people normally
# use and "gate" says what it turns on, so you know what to verify. Verify
# every one before you spend time on a market.
#
# adzuna: the country code for api.adzuna.com/v1/api/jobs/<code>/search - one
# key covers all of them. "" means Adzuna has no endpoint for that country, so
# the market is served by employer ATS sites and LinkedIn public pages only,
# and will return fewer rows. That is a coverage limit, not a thin market.

MARKETS = {
    "UAE": dict(
        rank=1, adzuna="", english_working=True,
        cities=["dubai", "abu dhabi", "sharjah", "difc"],
        route="Employer-sponsored UAE work permit and residence visa",
        gate="The employer applies and it is routine and fast. No points test, "
             "no salary threshold of the European kind, no language requirement.",
        why="Your strongest non-UK market and the one your CV was written for "
            "without meaning to be: retail banking, bancassurance and HNW "
            "portfolio work at Indian scale is directly relevant to Gulf banks "
            "serving the South Asian diaspora. UK employers discount that "
            "experience; UAE employers price it correctly.",
    ),
    "Ireland": dict(
        rank=2, adzuna="", english_working=True,
        cities=["dublin", "cork", "galway", "limerick"],
        route="Critical Skills Employment Permit, or General Employment Permit",
        gate="Turns on the occupation being on the eligible list and on a "
             "salary floor. Business and financial analysis roles have "
             "historically appeared on it - check the current list.",
        why="The market you left off your own list, and it is the second most "
            "sensible one: English-speaking, EU, and Dublin is a financial "
            "services centre. Note the UK notebook actively EXCLUDES Dublin "
            "and Ireland in its location filter, so you have never once seen "
            "an Irish role from this tool.",
    ),
    "Netherlands": dict(
        rank=3, adzuna="nl", english_working=True,
        cities=["amsterdam", "rotterdam", "utrecht", "the hague", "den haag",
                "eindhoven", "groningen", "tilburg", "amstelveen"],
        route="Highly Skilled Migrant via an IND-recognised sponsor, or the "
              "Orientation Year (zoekjaar) permit",
        gate="Highly Skilled Migrant needs the employer to be on the IND "
             "public register of recognised sponsors, plus a salary threshold. "
             "The Orientation Year is the one worth checking first: it is open "
             "to graduates of highly-ranked non-Dutch universities within a "
             "few years of graduating, and it carries unrestricted work rights "
             "for a year with no employer sponsorship at all. Warwick's "
             "ranking may put you inside it. Verify your eligibility and the "
             "deadline before anything else in this list.",
        why="Highest-value thing to check in this whole build. If the "
            "Orientation Year applies to you, the Netherlands stops being a "
            "sponsorship problem and becomes as open as the UK.",
    ),
    "Poland": dict(
        rank=4, adzuna="pl", english_working=True,
        cities=["warsaw", "warszawa", "krakow", "kraków", "wroclaw", "wrocław",
                "gdansk", "gdańsk", "poznan", "poznań", "katowice", "lodz"],
        route="Employer-applied work permit, or EU Blue Card",
        gate="Thresholds are materially lower than Western Europe and "
             "employers in the service-centre sector hire non-EU staff "
             "routinely because they cannot fill the roles locally.",
        why="Your own arbitrage argument is strongest here and you were right "
            "about it. Kraków, Warsaw and Wrocław are full of global business "
            "service centres running commercial operations, process redesign "
            "and transformation for Western European banks - which is "
            "literally your job history - and they operate in English because "
            "their customers are in fifteen countries.",
    ),
    "Singapore": dict(
        rank=5, adzuna="sg", english_working=True,
        cities=["singapore"],
        route="Employment Pass, assessed under the COMPASS points framework",
        gate="Points for salary, qualifications, employer diversity and local "
             "hiring. An MBA from a well-ranked school scores; the salary "
             "floor rises with age and sector.",
        why="English-working, major banking centre, and your Asian retail "
            "banking experience reads as relevant rather than foreign.",
    ),
    "Germany": dict(
        rank=6, adzuna="de", english_working=False,
        cities=["berlin", "munich", "münchen", "frankfurt", "hamburg",
                "cologne", "köln", "düsseldorf", "stuttgart", "leipzig"],
        route="EU Blue Card, or the Opportunity Card / job-seeker route",
        gate="Blue Card needs a recognised degree and a salary above a "
             "threshold that is lower for shortage occupations. The real gate "
             "for commercial roles is German, not the permit.",
        why="Large market, but commercial and customer-facing roles mostly run "
            "in German. Target Berlin tech and Frankfurt banking, where "
            "English-operating teams are common, and expect the language "
            "filter to remove most of what the search returns.",
    ),
    "Belgium": dict(
        rank=7, adzuna="be", english_working=False,
        cities=["brussels", "bruxelles", "antwerp", "antwerpen", "ghent", "leuven"],
        route="Single Permit (combined work and residence)",
        gate="Regional, employer-applied, with salary thresholds per region.",
        why="Brussels institutions and EU-facing roles often operate in "
            "English. Outside that, Dutch or French is usually real.",
    ),
    "Spain": dict(
        rank=8, adzuna="es", english_working=False,
        cities=["madrid", "barcelona", "valencia", "seville", "malaga", "bilbao"],
        route="Highly Qualified Professional permit, or EU Blue Card",
        gate="Employer-applied, salary thresholds, and the role must be "
             "genuinely qualified.",
        why="Barcelona and Madrid have growing shared-service hubs that run in "
            "English. Most other commercial roles will want Spanish.",
    ),
}

# Service-centre cities where English is usually the operating language and the
# work is commercial operations, process redesign and transformation - the
# closest match anywhere to what he actually did at Axis and HDFC.
GBS_HUBS = {
    "krakow", "kraków", "warsaw", "warszawa", "wroclaw", "wrocław",
    "gdansk", "gdańsk", "katowice", "poznan", "poznań",
    "budapest", "prague", "praha", "brno", "bucharest", "bucuresti",
    "lisbon", "lisboa", "porto", "dublin", "amsterdam", "rotterdam",
    "barcelona", "madrid", "sofia", "bratislava", "vilnius", "riga", "tallinn",
}


def market_for_location(location, country=""):
    """Which configured market a row belongs to, by city or country name."""
    text = re.sub(r"\s+", " ", f"{location} {country}".lower())
    for name, cfg in MARKETS.items():
        if name.lower() in text:
            return name
        for city in cfg["cities"]:
            if re.search(rf"\b{re.escape(city)}\b", text):
                return name
    return ""


def is_gbs_hub(location):
    text = re.sub(r"\s+", " ", str(location or "").lower())
    return any(re.search(rf"\b{re.escape(h)}\b", text) for h in GBS_HUBS)


def authorisation_note(market):
    cfg = MARKETS.get(market)
    if not cfg:
        return "", ""
    return cfg["route"], cfg["gate"]
