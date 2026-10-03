from i_language import detect_language_requirement as d

CASES = [
    # --- genuinely required ---
    ("Commercial Manager", "Fluent Dutch and English are required.", "REQUIRED", "Dutch"),
    ("Strategy Lead",      "Fluency in German is essential for this role.", "REQUIRED", "German"),
    ("Ops Manager",        "Native-level Polish speaker needed.", "REQUIRED", "Polish"),
    ("Analyst",            "You must speak French to liaise with the Paris office.", "REQUIRED", "French"),
    ("Consultant",         "German at C1 level.", "REQUIRED", "German"),
    ("Manager",            "Business Dutch and strong commercial instincts.", "REQUIRED", "Dutch"),
    ("BD Manager",         "Professional Arabic is mandatory.", "REQUIRED", "Arabic"),
    # required wins even when English is also reassured about
    ("Transformation Lead","Our working language is English. Fluent German required.", "REQUIRED", "German"),
    # --- desirable only: not a gate ---
    ("Commercial Manager", "Dutch is a plus but not required.", "DESIRABLE", "Dutch"),
    ("Strategy Manager",   "Knowledge of Polish would be an advantage.", "DESIRABLE", "Polish"),
    ("Ops Lead",           "Conversational German is nice to have.", "DESIRABLE", "German"),
    ("Analyst",            "Ideally you speak Spanish, though we work in English.", "DESIRABLE", "Spanish"),
    # --- English explicitly stated ---
    ("Programme Manager",  "Our company language is English and the team is international.", "ENGLISH_STATED", "English"),
    ("Manager",            "We work in English across all our offices.", "ENGLISH_STATED", "English"),
    ("Change Lead",        "All meetings are in English.", "ENGLISH_STATED", "English"),
    ("Strategy Manager",   "No local language is required for this position.", "ENGLISH_STATED", "English"),
    # --- the false friends: must NOT be read as language requirements ---
    ("Commercial Manager", "You will have polished communication skills.", "NOT_STATED", ""),
    ("BD Manager",         "A chance to polish your commercial craft.", "NOT_STATED", ""),
    ("Analyst",            "Highly polished stakeholder management.", "NOT_STATED", ""),
    ("Corporate Finance",  "Experience running a Dutch auction process.", "NOT_STATED", ""),
    ("Strategy Manager",   "Grow our presence in the German market.", "NOT_STATED", ""),
    ("Partnerships Lead",  "Own the Spanish market and Italian market P&L.", "NOT_STATED", ""),
    ("Manager",            "A varied commercial role in a growing team.", "NOT_STATED", ""),
]

print(f"{'want':<16}{'got':<16}{'lang':<10}advert")
print("-" * 100)
fails = 0
for title, desc, want_s, want_l in CASES:
    s, l, ev = d(title, desc)
    ok = (s == want_s and l == want_l)
    fails += not ok
    print(f"{'   ' if ok else '!! '}{want_s:<13}{s:<16}{l or '-':<10}{desc[:52]}")
print("-" * 100)
print(f"{len(CASES)-fails}/{len(CASES)} correct")
assert fails == 0, f"{fails} failures"
print("\nall language cases pass")
