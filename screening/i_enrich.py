

# ── DESCRIPTION ENRICHMENT ───────────────────────────────────────────────────
# Adzuna's API returns a ~200 character SNIPPET in its description field, not
# the advert. Everything downstream reads that field: the fit score, the honest
# gaps, the language gate and the AI screener. Fed a snippet, all four are
# guessing, and the scoring loop then *boosts* thin-description rows to
# compensate - so a role nobody can evaluate ranks higher, not lower.
#
# This is why a role with a language mandate printed in its advert still came
# through: the mandate was in the advert, and the advert never arrived.
ENRICH_DESCRIPTIONS = True
ENRICH_MIN_CHARS    = 600   # shorter than this is a snippet, not a job advert
ENRICH_MAX_FETCHES  = 250   # hard ceiling on HTTP calls added per run


def enrich_descriptions(jobs):
    """Fetch the real advert for rows whose description is too short to judge.
    Reads schema.org JobPosting markup first, which most boards embed, and
    falls back to page text. Never shrinks a description it already has."""
    if not ENRICH_DESCRIPTIONS:
        print("Description enrichment is OFF. Adzuna rows will carry a snippet only,")
        print("and the fit score and language gate will both be reading that snippet.")
        return jobs

    thin = [j for j in jobs
            if len(str(j.get("desc") or "").strip()) < ENRICH_MIN_CHARS
            and str(j.get("url") or "").startswith("http")]
    if not thin:
        print("Description enrichment: every row already carries a full advert.")
        return jobs

    # Spend the fetch budget on the most promising titles first.
    def _promise(job):
        try:
            return classify_track(job.get("title", ""), job.get("desc", ""))[2]
        except Exception:
            return 0
    thin.sort(key=_promise, reverse=True)
    budget = thin[:ENRICH_MAX_FETCHES]

    print(f"Description enrichment: {len(thin)} of {len(jobs)} rows carry less than "
          f"{ENRICH_MIN_CHARS} characters.")
    print(f"  Fetching the best {len(budget)} of them. This is the slow part of the run.")

    filled = failed = 0
    for index, job in enumerate(budget, 1):
        url = job["url"]
        try:
            response = request_with_backoff(url, headers=headers_browser, timeout=15)
            html = response.text
            best = ""
            for found in parse_jsonld_jobs(html, "enrichment", url):
                text = str(found.get("desc") or "")
                if len(text) > len(best):
                    best = text
            if len(best) < ENRICH_MIN_CHARS:
                soup = BeautifulSoup(html, "html.parser")
                for tag in soup(["script", "style", "nav", "header", "footer"]):
                    tag.decompose()
                page = re.sub(r"\s+", " ", soup.get_text(" ")).strip()
                if len(page) > len(best):
                    best = page[:40000]
            if len(best) > len(str(job.get("desc") or "")):
                job["desc"] = best
                job["desc_enriched"] = True
                filled += 1
            else:
                failed += 1
        except Exception:
            failed += 1
        if index % 50 == 0:
            print(f"    {index}/{len(budget)} fetched, {filled} adverts recovered")

    skipped = len(thin) - len(budget)
    print(f"  Recovered {filled} full adverts, {failed} could not be read"
          + (f", {skipped} left thin because the fetch budget ran out." if skipped else "."))
    if filled:
        print("  Those rows are now scored and language-checked on the real advert.")
    return jobs
