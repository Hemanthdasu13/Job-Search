import re

# ── LANGUAGE REQUIREMENT DETECTION ───────────────────────────────────────────
# The question is never "does this advert mention Dutch". It is "does this role
# REQUIRE Dutch, or merely prefer it". That is the same essential/desirable
# split the screening rubric already runs on, applied to language.
#
# An advert written in English is NOT evidence that the job is done in English.
# Plenty of Dutch and Polish employers advertise in English for roles whose
# daily operating language is local. Only explicit statements count here.

LANGUAGES = [
    "dutch", "german", "french", "polish", "spanish", "italian", "portuguese",
    "swedish", "danish", "norwegian", "finnish", "czech", "hungarian",
    "romanian", "slovak", "bulgarian", "greek", "arabic", "flemish",
    "mandarin", "japanese", "korean", "turkish", "russian", "hebrew",
]

# Phrases that contain a language word but say nothing about language ability.
# "Polish" is the dangerous one: "polished communication skills" and "polish
# your craft" appear in a large share of commercial job adverts, and a naive
# match would mark half of Europe as requiring Polish. Same bug class as
# "contract management" and "undergraduate".
_LANGUAGE_FALSE_FRIENDS = [
    "polished", "polish your", "polish up", "polish the", "well-polished",
    "highly polished", "polish and", "spit and polish",
    "dutch auction", "dutch courage", "going dutch",
    "german market", "german markets", "german engineering", "german business",
    "french market", "french markets", "french fries",
    "spanish market", "spanish markets", "italian market", "italian markets",
    "arabic numerals", "greek letters", "russian doll",
    "romanian market", "turkish market", "danish pastry",
]

_REQUIRED_TEMPLATES = [
    r"fluent (?:in |written and spoken )?{lang}",
    r"fluency in {lang}",
    r"native(?:[- ]level)? {lang}",
    r"{lang} (?:is )?(?:a )?(?:must|essential|required|mandatory)",
    r"must (?:speak|be fluent in|have) {lang}",
    r"(?:excellent|professional|business|strong|high)(?:[- ]level)? {lang}",
    r"{lang} (?:at )?(?:c1|c2|b2)\b",
    r"\b(?:c1|c2)(?:[- ]level)? {lang}",
    r"{lang} language skills (?:are )?(?:required|essential)",
    r"proficien\w+ in {lang}",
    r"command of (?:the )?{lang}",
    r"{lang} speaking (?:is )?(?:required|essential)",
    r"only candidates (?:who|with) .{{0,30}}{lang}",
]

_DESIRABLE_TEMPLATES = [
    r"{lang} (?:is |would be |is considered )?(?:a )?(?:plus|bonus|advantage|advantageous|asset|desirable|beneficial|welcome)",
    r"{lang} (?:is )?nice to have",
    r"(?:knowledge|understanding|basics?) of {lang}",
    r"(?:some|basic|conversational|working) {lang}",
    r"ideally (?:you )?(?:speak|have) {lang}",
    r"willingness to learn {lang}",
    r"{lang} (?:skills )?(?:are )?(?:not required|not essential)",
]

_ENGLISH_OK = [
    r"(?:our |the )?(?:company |corporate |business |official )?(?:working |operating )?language is english",
    r"we (?:work|operate|communicate) in english",
    r"english is (?:our|the) (?:only )?(?:working|business|company|official) language",
    r"english[- ]speaking (?:environment|workplace|office|team)",
    r"all (?:meetings|communication|documentation) (?:are |is )?in english",
    r"no (?:knowledge of )?(?:local|\w+) language (?:is )?(?:required|needed|necessary)",
    r"international (?:working )?environment with english",
    r"fluent english is (?:the only|all we|sufficient)",
]


def _mask(text):
    for phrase in _LANGUAGE_FALSE_FRIENDS:
        text = text.replace(phrase, " " * len(phrase))
    return text


def detect_language_requirement(title, description=""):
    """
    Returns (status, language, evidence).

    status is one of:
      REQUIRED           a named language is an essential criterion - a gate
      DESIRABLE          named but explicitly optional - not a gate
      ENGLISH_STATED     the advert says it operates in English
      NOT_STATED         no language requirement mentioned either way

    REQUIRED is checked before DESIRABLE, and both before ENGLISH_STATED,
    because "our working language is English, fluent German required" is a
    German-required role that happens to reassure you about English.
    """
    text = _mask(re.sub(r"\s+", " ", f"{title} {description}".lower()))

    for lang in LANGUAGES:
        for template in _REQUIRED_TEMPLATES:
            m = re.search(template.replace("{lang}", lang), text)
            if m:
                return "REQUIRED", lang.capitalize(), m.group(0).strip()

    for lang in LANGUAGES:
        for template in _DESIRABLE_TEMPLATES:
            m = re.search(template.replace("{lang}", lang), text)
            if m:
                return "DESIRABLE", lang.capitalize(), m.group(0).strip()

    for pattern in _ENGLISH_OK:
        m = re.search(pattern, text)
        if m:
            return "ENGLISH_STATED", "English", m.group(0).strip()

    return "NOT_STATED", "", ""


def language_verdict(status, language):
    """Plain English for the workbook column."""
    if status == "REQUIRED":
        return (f"Gate: {language} required",
                f"The advert makes {language} an essential criterion. Not worth an "
                f"application unless you have it.")
    if status == "DESIRABLE":
        return (f"{language} preferred, not required",
                f"{language} is named as desirable. Apply, and lead with the thing "
                f"they cannot get locally rather than apologising for the language.")
    if status == "ENGLISH_STATED":
        return ("English stated",
                "The advert states it operates in English. The strongest category "
                "to target in a non-English-speaking market.")
    return ("Language not stated",
            "No language requirement either way. Treat as unknown and ask early - "
            "an advert in English does not mean the job is done in English.")
