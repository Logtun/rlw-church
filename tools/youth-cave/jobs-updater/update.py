#!/usr/bin/env python3
"""RLW Youth Cave - daily Jobs & Opportunities updater.

Pulls real listings from public feeds (no web search), filters them for:
  - entry-level / graduate trainee / intern roles in Lagos or Ogun (or Nigeria-wide)
  - remote roles open worldwide, to Africa or to Nigeria
  - tech roles
  - scholarships (and funded fellowships) open to Nigerians
then POSTs them to https://rlw-youth.sites.tab.bot/api/jobs/import.

Run:  timeout -k 10 600 python3 /home/user/tab/work/youth_jobs/update.py
Options: --dry-run (no POST, prints picks)  --json (write picks to picks.json)
Always exits 0 unless the import itself could not be reached at all (exit 2).
"""
import concurrent.futures as cf
import datetime as dt
import email.utils
import html
import json
import os
import re
import sys
import time

import requests
from lxml import etree, html as LH

HERE = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(HERE, ".key")
SEEN_FILE = os.path.join(HERE, "seen.json")
IMPORT_URL = "https://rlw-youth.sites.tab.bot/api/jobs/import"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9"}
T0 = time.time()
BUDGET = 420  # seconds for all fetching; the wrapper `timeout` is the hard stop
LAGOS = dt.timezone(dt.timedelta(hours=1))
TODAY = dt.datetime.now(LAGOS).date()
QUOTA = {"jobs": 11, "tech": 7, "remote": 8, "scholarships": 8}  # new items per day (about 30-34); the site keeps ~120, so a listing stays about 4 days
MAX_AGE_DAYS = {"jobs": 7, "tech": 7, "remote": 7, "scholarships": 21}

DRY = "--dry-run" in sys.argv
STATUS = {}   # source -> "ok N" / "failed: why"


def left():
    return BUDGET - (time.time() - T0)


def get(url, timeout=15, **kw):
    if left() < 5:
        raise RuntimeError("time budget used up")
    r = requests.get(url, headers=UA, timeout=(8, timeout), **kw)
    r.raise_for_status()
    return r


def fix_moji(s):
    if s and re.search("[\u00c2\u00c3\u00e2][\u0080-\u00bf\u20ac\u201a-\u201e\u2018-\u201d\u2122]?", s):
        try:
            return s.encode("cp1252", "ignore").decode("utf-8")
        except Exception:
            try:
                return s.encode("latin-1").decode("utf-8")
            except Exception:
                return s
    return s


def clean(s, n=400):
    s = fix_moji(html.unescape(re.sub(r"<[^>]+>", " ", s or "")))
    s = s.replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n]


def short(s, n=220):
    s = clean(s, 2000)
    if len(s) <= n:
        return s
    cut = s[:n].rsplit(" ", 1)[0]
    return cut.rstrip(",;:-") + "..."


def pdate(s):
    """RSS/ISO date -> date (Lagos)."""
    if not s:
        return None
    try:
        d = email.utils.parsedate_to_datetime(s)
        return d.astimezone(LAGOS).date()
    except Exception:
        pass
    try:
        return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(LAGOS).date()
    except Exception:
        return None


MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                       "september", "october", "november", "december"], 1)}
MON3 = {k[:3]: v for k, v in MONTHS.items()}


def find_deadline(text):
    """'Deadline: November 30, 2026' / 'Application Deadline: 15th December 2026' -> 'YYYY-MM-DD' or ''."""
    t = clean(text, 6000)
    m = re.search(r"(?:deadline|closing date|apply before|applications close[sd]?)[^.:\n]{0,30}[:\-]?\s*(.{0,60})", t, re.I)
    if not m:
        return ""
    s = m.group(1)
    pats = [
        (r"([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)", "mdy"),
        (r"(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(20\d\d)", "dmy"),
    ]
    for p, kind in pats:
        mm = re.search(p, s)
        if mm:
            a, b, y = mm.groups()
            mon, day = (a, b) if kind == "mdy" else (b, a)
            mo = MONTHS.get(mon.lower()) or MON3.get(mon.lower()[:3])
            if not mo:
                continue
            try:
                return dt.date(int(y), mo, int(day)).isoformat()
            except ValueError:
                return ""
    return ""


# ---------- filters ----------
SENIOR = re.compile(r"\b(senior|snr|sr\.?|lead|principal|staff engineer|head of|head,|\bhead\b|director|chief|vp|vice president|manager|"
                    r"supervisor|architect|partner|consultant physician|professor|lecturer|coordinator general|executive director|"
                    r"ceo|cto|cfo|coo|general counsel|superintendent|team lead)\b", re.I)
JUNIOR = re.compile(r"\b(intern|internship|interns|graduate|trainee|entry[- ]level|junior|jnr|assistant|nysc|corper|fresh|"
                    r"apprentice|associate|attendant|officer|representative|executive|clerk|cashier|teller|officers|"
                    r"agent|volunteer|fellow|analyst|developer|designer|writer|support)\b", re.I)
TECH = re.compile(r"\b(software|developer|engineer(ing)? \(software|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|"
                  r"web developer|web design|mobile (app|developer|engineer)|android|ios|devops|cloud|data (analyst|scientist|engineer)|data analysis|machine learning|\bml\b|\bai\b|"
                  r"cyber ?security|it support|it officer|i\.t\.|ict|network|qa|tester|ui/ux|ux|ui designer|product designer|"
                  r"python|javascript|react|php|java|programmer|systems? admin|database|sql|blockchain|computer|technical support|"
                  r"help ?desk|it intern|it trainee|tech)\b", re.I)
PAYMENT = re.compile(r"(?<!no )(?<!without )(?<!free of )(application|registration|processing|form|screening|training) fee|"
                     r"pay (a|the|us)\b|payment of|send (money|airtime)|recharge card", re.I)
SPAM = re.compile(r"\b(earn \$?\d+ (daily|per day)|work from home and earn|whatsapp us|telegram us|forex|binary option|"
                  r"get rich|mlm|network marketing)\b", re.I)
YEARS = re.compile(r"(\d{1,2})\s*(?:\+|-|–|to)?\s*(\d{1,2})?\s*\+?\s*years?", re.I)


def min_years(text):
    """Smallest minimum experience asked for, or None."""
    best = None
    for m in YEARS.finditer(text or ""):
        a = int(m.group(1))
        ctx = text[max(0, m.start() - 60): m.end() + 40].lower()
        if "experience" not in ctx and "post" not in ctx and "work" not in ctx:
            continue
        if a > 40:
            continue
        best = a if best is None else min(best, a)
    return best


def bad_text(t):
    return bool(PAYMENT.search(t) or SPAM.search(t))


def is_entry(title, desc="", exp=""):
    if SENIOR.search(title):
        return False
    y = None
    if exp:
        y = min_years(exp + " experience")
    if y is None:
        y = min_years(desc)
    if y is not None and y >= 4:
        return False
    return True


LOC_OK = re.compile(r"\b(lagos|ogun|abeokuta|ikeja|lekki|victoria island|ikorodu|sagamu|shagamu|ota|sango|mowe|ibafo|magboro|"
                    r"ijebu|nationwide|nigeria-wide|across nigeria|all states|remote)\b", re.I)


def tag_cat(title, text=""):
    return "tech" if TECH.search(title) or (text and TECH.search(text[:200]) and re.search(r"\b(it|ict|tech)\b", title, re.I)) else "jobs"


# ---------- sources ----------
def rss_items(content):
    t = etree.fromstring(content, etree.XMLParser(recover=True, huge_tree=True))
    out = []
    for it in t.iter("item"):
        d = {}
        cats = []
        for c in it:
            tag = c.tag.split("}")[-1] if isinstance(c.tag, str) else ""
            if tag == "category":
                if c.text and c.text.strip():
                    cats.append(c.text.strip())
            elif tag in ("title", "link", "pubDate", "description", "region", "industry", "encoded"):
                d[tag] = c.text or ""
        d["categories"] = cats
        out.append(d)
    return out


def src_myjobmag():
    items = rss_items(get("https://www.myjobmag.com/jobsxml.xml").content)
    cand = []
    for it in items:
        title = clean(it.get("title"), 200)
        pd_ = pdate(it.get("pubDate"))
        if SENIOR.search(title) or bad_text(title + " " + it.get("description", "")):
            continue
        cand.append((title, it.get("link", "").strip(), pd_, it))

    def detail(c):
        title, url, pd_, it = c
        try:
            d = LH.fromstring(get(url, timeout=12).content)
        except Exception:
            return None
        info = {}
        for li in d.xpath('//ul[contains(@class,"job-key-info")]/li'):
            k = clean(" ".join(li.xpath('.//span[contains(@class,"jkey-title")]//text()')), 40).lower()
            v = clean(" ".join(li.xpath('.//span[contains(@class,"jkey-info")]//text()')), 200)
            info[k] = v
        body = clean(" ".join(d.xpath('//div[contains(@class,"job-details")]//text()|//div[@id="printable"]//text()')), 5000)
        loc = info.get("location", "")
        if not LOC_OK.search(loc):
            return None
        if not is_entry(title, body, info.get("experience", "")):
            return None
        if bad_text(body):
            return None
        org = ""
        m = re.search(r"\bat (.+)$", title)
        if m:
            org = m.group(1).strip()
        field = info.get("job field", "")
        cat = "tech" if re.search(r"ict|computer|software|telecom", field, re.I) or TECH.search(title) else "jobs"
        jt = info.get("job type", "")
        exp = info.get("experience", "")
        summ = "; ".join(x for x in [jt, ("Experience: " + exp) if exp else "", info.get("qualification", "")] if x)
        return {"url": url, "title": title, "org": org, "location": loc, "category": cat, "posted": pd_,
                "deadline": find_deadline(body), "source": "MyJobMag", "summary": short(summ or it.get("description", ""))}

    out = []
    with cf.ThreadPoolExecutor(8) as ex:
        for r in ex.map(detail, cand[:70]):
            if r:
                out.append(r)
    return out


def src_hotnigerianjobs():
    items = rss_items(get("https://www.hotnigerianjobs.com/feed/", timeout=25).content)
    out = []
    for it in items:
        title = clean(it.get("title"), 200)
        desc = clean(it.get("description"), 3000)
        m = re.search(r"located in ([^.]+)\.", desc)
        loc = clean(m.group(1), 120) if m else ""
        if not loc or not LOC_OK.search(loc):
            continue
        if not is_entry(title, desc) or bad_text(title + " " + desc):
            continue
        org = ""
        m2 = re.match(r"(.+?) is (?:recruiting|currently recruiting|hiring|inviting)", desc)
        if m2:
            org = m2.group(1).strip()[:160]
        elif " at " in title:
            org = title.rsplit(" at ", 1)[1]
        out.append({"url": it.get("link", "").strip(), "title": title, "org": org, "location": loc,
                    "category": tag_cat(title), "posted": pdate(it.get("pubDate")), "deadline": find_deadline(desc),
                    "source": "Hot Nigerian Jobs", "summary": short(desc)})
    return out


def jobberman_page(url, need_junior):
    d = LH.fromstring(get(url, timeout=25).content)
    out, seen = [], set()
    for a in d.xpath('//a[contains(@href,"/listings/")]'):
        href = a.get("href", "").split("?")[0]
        if href in seen or not href.startswith("https://www.jobberman.com/listings/"):
            continue
        card = a
        for _ in range(4):
            if card.getparent() is not None:
                card = card.getparent()
        bits = [clean(s, 300) for s in card.itertext() if clean(s, 300)]
        if len(bits) < 4:
            continue
        seen.add(href)
        title = clean(a.text_content(), 200)
        try:
            i = bits.index(title)
        except ValueError:
            i = 0
        org = bits[i + 1] if i + 1 < len(bits) else ""
        posted = next((b for b in bits if b.lower().startswith("posted")), "")
        jtypes = ("Full Time", "Part Time", "Contract", "Internship & Graduate", "Internship", "Temporary", "Remote", "Freelance")
        loc, jt = "", ""
        for k, b in enumerate(bits):
            if b in jtypes and k > 0:
                jt, loc = b, bits[k - 1]
                break
        desc = next((b for b in bits if len(b) > 120), "")
        if not loc or not LOC_OK.search(loc + " " + jt):
            continue
        if not is_entry(title, desc) or bad_text(title + " " + desc):
            continue
        if need_junior and not (JUNIOR.search(title) or jt.startswith("Internship")):
            continue
        days = 0
        m = re.search(r"(\d+)\s+(day|week|month)", posted)
        if m:
            days = int(m.group(1)) * {"day": 1, "week": 7, "month": 30}[m.group(2)]
        if org == "Featured":
            org = ""
        out.append({"url": href, "title": title, "org": org, "location": loc, "category": tag_cat(title),
                    "posted": TODAY - dt.timedelta(days=days), "deadline": "", "source": "Jobberman",
                    "summary": short(re.sub(r"^([A-Za-z &/,]+ )?[-\u2013]\s*", "", desc) if desc else jt)})
    return out


def src_jobberman():
    out, errs = [], []
    for url, junior in [("https://www.jobberman.com/jobs/internship-graduate", False),
                        ("https://www.jobberman.com/jobs/lagos", True),
                        ("https://www.jobberman.com/jobs/abeokuta-ogun", True),
                        ("https://www.jobberman.com/jobs/software-data", True)]:
        try:
            out += jobberman_page(url, junior)
        except Exception as e:
            errs.append(str(e)[:60])
    if not out and errs:
        raise RuntimeError(errs[0])
    return out


SENIOR_REMOTE = re.compile(r"\b(senior|sr\.?|lead|principal|staff|head|director|vp|chief|manager|architect|expert|iii|iv|tier iii|level [3-9])\b", re.I)
NOT_FOR_NG = re.compile(r"(^|\b)(us|usa|u\.s\.|canada|uk|eu|latam|apac)[- ](remote|based|only)\b|\b(dutch|german|french|spanish|italian|portuguese|"
                        r"japanese|korean|chinese|mandarin|polish|swedish|norwegian|danish|finnish|turkish|arabic|hebrew|greek|czech|"
                        r"hungarian|romanian|russian|ukrainian|thai|vietnamese|indonesian|malay|hindi|tagalog)\b(?! (government|university))|"
                        r"remote\s*[-\u2013(,/]\s*(us|usa|canada|uk|europe|eu|latam|apac|emea only)\b|"
                        r"\b(youth|students|residents|citizens) in the (usa|us|uk|united states)\b|^(latest )?jobs at\b", re.I)
BLOCK_ORGS = re.compile(r"\b(iapwe|international association of professional writers)\b", re.I)
WORLD = re.compile(r"\b(worldwide|anywhere|global|world|international|africa|emea|nigeria)\b", re.I)


def remote_item(url, title, org, loc, posted, src, summary, techy):
    return {"url": url, "title": title, "org": org, "location": "Remote" + (" (" + loc + ")" if loc and loc.lower() not in ("remote", "") else ""),
            "category": "remote", "tags": "tech" if techy else "", "posted": posted, "deadline": "", "source": src,
            "summary": short(summary)}


def src_remotive():
    js = get("https://remotive.com/api/remote-jobs?limit=300", timeout=30).json()["jobs"]
    out = []
    for j in js:
        loc = j.get("candidate_required_location") or ""
        if not WORLD.search(loc):
            continue
        t = clean(j["title"], 200)
        if SENIOR_REMOTE.search(t) or bad_text(t):
            continue
        techy = j.get("category") in ("Software Development", "DevOps / Sysadmin", "Data", "QA", "Product") or bool(TECH.search(t))
        out.append(remote_item(j["url"], t, clean(j.get("company_name"), 160), loc, pdate(j.get("publication_date")),
                               "Remotive", (j.get("category") or "") + ". " + (j.get("job_type") or "").replace("_", " "), techy))
    return out


def src_jobicy():
    js = get("https://jobicy.com/api/v2/remote-jobs?count=100&geo=anywhere", timeout=30).json()["jobs"]
    out = []
    for j in js:
        t = clean(j["jobTitle"], 200)
        if j.get("jobLevel") in ("Senior", "Director", "Lead", "Manager") or SENIOR_REMOTE.search(t) or bad_text(t):
            continue
        ind = ", ".join(j.get("jobIndustry") or []) if isinstance(j.get("jobIndustry"), list) else str(j.get("jobIndustry") or "")
        techy = bool(re.search(r"programming|dev|data|engineering|technical|qa|design", ind, re.I) or TECH.search(t))
        out.append(remote_item(j["url"], t, clean(j.get("companyName"), 160), "Anywhere", pdate(j.get("pubDate")), "Jobicy",
                               clean(html.unescape(j.get("jobExcerpt") or ""), 400), techy))
    return out


def src_himalayas():
    out = []
    js = get("https://himalayas.app/jobs/api/search?country=Nigeria&seniority=Entry-level&sort=recent", timeout=30).json()["jobs"]
    per_co = {}
    for j in js:
        t = clean(j["title"], 200)
        lr = j.get("locationRestrictions") or []
        if lr and "Nigeria" not in lr:
            continue
        sen = j.get("seniority") or []
        if sen and "Entry-level" not in sen:
            continue
        if SENIOR_REMOTE.search(t) or bad_text(t + " " + (j.get("excerpt") or "")):
            continue
        co = clean(j.get("companyName"), 160)
        per_co[co] = per_co.get(co, 0) + 1
        if per_co[co] > 2:
            continue
        pub = j.get("pubDate")
        posted = dt.datetime.fromtimestamp(pub, LAGOS).date() if isinstance(pub, (int, float)) else pdate(pub)
        exp = j.get("expiryDate")
        dl = dt.datetime.fromtimestamp(exp, LAGOS).date().isoformat() if isinstance(exp, (int, float)) else ""
        cats = " ".join(j.get("categories") or []) + " " + " ".join(j.get("parentCategories") or [])
        techy = bool(re.search(r"software|engineer|developer|data|it|devops|design|qa", cats, re.I) or TECH.search(t))
        url = j.get("applicationLink") or j.get("guid")
        it = remote_item(url, t, co, "Nigeria eligible" if lr else "Worldwide", posted, "Himalayas", j.get("excerpt") or "", techy)
        it["deadline"] = ""  # their expiry is a listing expiry, not an application deadline
        out.append(it)
    return out


def src_workingnomads():
    js = get("https://www.workingnomads.com/api/exposed_jobs/", timeout=30).json()
    out = []
    for j in js:
        loc = j.get("location") or ""
        if not WORLD.search(loc) or re.search(r"\b(only|usa|u\.s\.)\b", loc, re.I):
            continue
        t = clean(j["title"], 200)
        if SENIOR_REMOTE.search(t) or bad_text(t):
            continue
        techy = bool(re.search(r"development|devops|data|engineer|design|qa|system", j.get("category_name") or "", re.I) or TECH.search(t))
        out.append(remote_item(j["url"], t, clean(j.get("company_name"), 160), loc, pdate(j.get("pub_date")), "Working Nomads",
                               (j.get("category_name") or "") + ". " + clean(j.get("description"), 300), techy))
    return out


def src_remoteok():
    js = json.loads(get("https://remoteok.com/api", timeout=30).content)[1:]
    out = []
    for j in js:
        loc = j.get("location") or ""
        if not re.search(r"worldwide|anywhere|global", loc, re.I):
            continue
        t = clean(j.get("position"), 200)
        if SENIOR_REMOTE.search(t) or bad_text(t):
            continue
        techy = bool(TECH.search(t) or set(map(str.lower, j.get("tags") or [])) & {"dev", "engineer", "software", "backend", "frontend", "data"})
        out.append(remote_item(j.get("url"), t, clean(j.get("company"), 160), loc, pdate(j.get("date")), "Remote OK",
                               ", ".join((j.get("tags") or [])[:6]), techy))
    return out


def src_wwr():
    out = []
    for u in ["https://weworkremotely.com/categories/remote-programming-jobs.rss",
              "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
              "https://weworkremotely.com/categories/remote-design-jobs.rss"]:
        try:
            items = rss_items(get(u, timeout=25).content)
        except Exception:
            continue
        for it in items:
            region = clean(it.get("region"), 120)
            if not re.search(r"anywhere|worldwide", region, re.I):
                continue
            raw = clean(it.get("title"), 220)
            org, _, t = raw.partition(":")
            t = t.strip() or raw
            if SENIOR_REMOTE.search(t) or bad_text(raw):
                continue
            techy = "programming" in u or "design" in u or bool(TECH.search(t))
            out.append(remote_item(it.get("link", "").strip(), t, org.strip(), region, pdate(it.get("pubDate")),
                                   "We Work Remotely", clean(it.get("description"), 300), techy))
    if not out:
        raise RuntimeError("no worldwide items")
    return out


SCH = re.compile(r"scholarship|fellowship|grant|bursary|studentship|funded|award", re.I)
OPEN_NG = re.compile(r"africa|nigeria|developing countr|international|all countries|worldwide|global|any country|commonwealth|eligible countries", re.I)


def wp_feed(base, src, need_open):
    out = []
    for page in (1, 2):
        u = base + ("" if page == 1 else "?paged=2")
        try:
            items = rss_items(get(u, timeout=20).content)
        except Exception:
            if page == 1:
                raise
            break
        for it in items:
            title = clean(it.get("title"), 200)
            cats = " ".join(it.get("categories") or [])
            text = clean((it.get("description") or "") + " " + (it.get("encoded") or ""), 6000)
            if re.search(r"^(top \d+|\d+ (hot )?job|\d+ universities|how to|list of)", title, re.I) or re.search(r"\b(blog|hot jobs|list of)\b", cats, re.I):
                continue
            if not (SCH.search(title) or re.search(r"scholarship|fellowship", cats, re.I)):
                continue
            if need_open and not OPEN_NG.search(cats + " " + title + " " + text[:1500]):
                continue
            if bad_text(title):
                continue
            host = ""
            m = re.search(r"\b(?:in|at) (?:the )?([A-Z][\w&.\- ]{2,60}?)(?: \d{4}| \||$)", title)
            if m:
                host = m.group(1).strip()
            out.append({"url": it.get("link", "").strip(), "title": title, "org": "", "location": host_loc(title, cats),
                        "category": "scholarships", "posted": pdate(it.get("pubDate")),
                        "deadline": find_deadline(text), "source": src, "summary": short(text)})
    return out


def host_loc(title, cats):
    m = re.search(r"\bin (?:the )?(UK|USA|US|Canada|Germany|France|Netherlands|Ireland|Australia|Japan|China|Korea|Sweden|Italy|Spain|"
                  r"Switzerland|Belgium|Denmark|Norway|Finland|Austria|Hungary|Turkey|New Zealand|South Africa|Rwanda|Kenya|Nigeria|Europe|Asia|Africa)\b", title)
    if m:
        return m.group(1)
    if re.search(r"online|virtual", title + " " + cats, re.I):
        return "Online"
    return "International"


def src_oppdesk():
    return wp_feed("https://opportunitydesk.org/feed/", "Opportunity Desk", True)


def src_ofa():
    return wp_feed("https://www.opportunitiesforafricans.com/feed/", "Opportunities For Africans", False)


def src_schreg():
    return wp_feed("https://www.scholarshipregion.com/feed/", "Scholarship Region", False)


def src_s4d():
    return wp_feed("https://www.scholars4dev.com/feed/", "Scholars4Dev", True)


SOURCES = [("MyJobMag", src_myjobmag), ("Hot Nigerian Jobs", src_hotnigerianjobs), ("Jobberman", src_jobberman),
           ("Remotive", src_remotive), ("Jobicy", src_jobicy), ("Himalayas", src_himalayas), ("Working Nomads", src_workingnomads),
           ("Remote OK", src_remoteok), ("We Work Remotely", src_wwr),
           ("Opportunity Desk", src_oppdesk), ("Opportunities For Africans", src_ofa), ("Scholarship Region", src_schreg),
           ("Scholars4Dev", src_s4d)]


STOP = {"the", "for", "and", "of", "in", "at", "to", "a", "an", "program", "programme", "fully", "funded", "2026", "2027", "2028", "with", "on"}


def similar(a, b):
    wa = {w for w in norm_title(a).split() if w not in STOP and len(w) > 1}
    wb = {w for w in norm_title(b).split() if w not in STOP and len(w) > 1}
    if not wa or not wb:
        return False
    return len(wa & wb) / min(len(wa), len(wb)) >= 0.75


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def main():
    results = {}

    def run(s):
        name, fn = s
        try:
            items = fn()
            return name, items, None
        except Exception as e:
            return name, [], (type(e).__name__ + ": " + str(e))[:120]

    with cf.ThreadPoolExecutor(6) as ex:
        for name, items, err in ex.map(run, SOURCES):
            results[name] = items
            STATUS[name] = ("ok %d" % len(items)) if err is None else ("failed (%s)" % err)

    try:
        seen = json.load(open(SEEN_FILE))
    except Exception:
        seen = {}
    # drop seen entries older than 30 days
    cutoff = (TODAY - dt.timedelta(days=30)).isoformat()
    seen = {u: d for u, d in seen.items() if d >= cutoff}

    pool, keys = [], set()
    # interleave sources so one source does not take a whole quota
    order = [n for n, _ in SOURCES]
    buckets = {n: list(results.get(n, [])) for n in order}
    for n in order:
        buckets[n].sort(key=lambda x: x.get("posted") or dt.date(2000, 1, 1), reverse=True)
    while any(buckets.values()):
        for n in order:
            if buckets[n]:
                pool.append(buckets[n].pop(0))

    picked = {c: [] for c in QUOTA}
    refreshed = []
    kept, org_n = [], {}
    for it in pool:
        url = (it.get("url") or "").strip()
        if not url.startswith("http"):
            continue
        k = norm_title(it["title"]) + "|" + norm_title(it.get("org"))
        if k in keys or url in keys:
            continue
        if BLOCK_ORGS.search((it.get("org") or "") + " " + it["title"]) or NOT_FOR_NG.search(it["title"]):
            continue
        if any(similar(it["title"], x["title"]) for x in kept):
            continue
        cat = it["category"]
        posted = it.get("posted")
        if posted and (TODAY - posted).days > MAX_AGE_DAYS[cat]:
            continue
        if it.get("deadline") and it["deadline"] < TODAY.isoformat():
            continue
        org_k = norm_title(it.get("org"))
        if org_k and org_n.get(org_k, 0) >= 2:
            continue
        keys.add(k)
        keys.add(url)
        kept.append(it)
        if org_k:
            org_n[org_k] = org_n.get(org_k, 0) + 1
        if url in seen:
            refreshed.append(it)  # already on the site: send again so details stay current (does not count as new)
            continue
        if len(picked[cat]) < QUOTA[cat]:
            picked[cat].append(it)
    # spare quota: let other categories fill up to ~40 new items total
    total_q = sum(QUOTA.values())
    spare = total_q - sum(len(v) for v in picked.values())
    if spare > 0:
        for it in kept:
            if spare <= 0:
                break
            url = it.get("url")
            if url in seen or any(url == x["url"] for v in picked.values() for x in v):
                continue
            cat = it["category"]
            posted = it.get("posted")
            if posted and (TODAY - posted).days > MAX_AGE_DAYS[cat]:
                continue
            if it.get("deadline") and it["deadline"] < TODAY.isoformat():
                continue
            k = norm_title(it["title"]) + "|" + norm_title(it.get("org"))
            if any(k == norm_title(x["title"]) + "|" + norm_title(x.get("org")) for v in picked.values() for x in v):
                continue
            if cat in ("jobs", "tech", "scholarships") and len(picked[cat]) < QUOTA[cat] + 4:
                picked[cat].append(it)
                spare -= 1

    # round-robin across categories so each day's batch reads mixed (the site lists a day's finds in this order)
    new, lists = [], [list(v) for v in picked.values()]
    while any(lists):
        for l in lists:
            if l:
                new.append(l.pop(0))
    send = new + refreshed[:60]
    payload = []
    for it in send:
        payload.append({"url": it["url"], "title": it["title"], "org": it.get("org", ""), "location": it.get("location", ""),
                        "category": it["category"], "tags": it.get("tags", ""), "deadline": it.get("deadline", ""),
                        "found": TODAY.isoformat(), "source": it.get("source", ""), "summary": it.get("summary", "")})

    if "--json" in sys.argv or DRY:
        with open(os.path.join(HERE, "picks.json"), "w") as f:
            json.dump(payload, f, indent=1, default=str)

    counts_new = {c: len(v) for c, v in picked.items()}
    ok_src = [n for n in order if STATUS[n].startswith("ok")]
    bad_src = [n + " " + STATUS[n] for n in order if not STATUS[n].startswith("ok")]
    site = ""
    exit_code = 0
    if DRY:
        site = "dry run, nothing sent"
    else:
        key = open(KEY_FILE).read().strip()
        res = {"added": 0, "updated": 0, "blocked": 0, "skipped": 0}
        final = None
        try:
            chunks = [payload[i:i + 20] for i in range(0, len(payload), 20)] or [[]]
            for i, ch in enumerate(chunks):
                last = i == len(chunks) - 1
                body = {"items": ch, "final": last, "sources": STATUS if last else None}
                r = requests.post(IMPORT_URL, json=body, headers={"x-import-key": key, "user-agent": "rlw-youth-jobs-updater"}, timeout=(10, 60))
                j = r.json()
                if not j.get("ok"):
                    raise RuntimeError("import refused: %s %s" % (r.status_code, j.get("error")))
                for k2 in res:
                    res[k2] += j.get(k2, 0)
                if last:
                    final = j
            for it in send:
                seen.setdefault(it["url"], TODAY.isoformat())
            tmp = SEEN_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(seen, f)
            if os.path.getsize(tmp) > 0:
                os.replace(tmp, SEEN_FILE)
            site = "site: added %d, refreshed %d, removed %s, now live %s" % (
                res["added"], res["updated"], final.get("removed"), json.dumps(final.get("counts", {}), sort_keys=True))
        except Exception as e:
            site = "IMPORT FAILED: %s" % str(e)[:160]
            exit_code = 2
    print("youth-jobs %s | new: jobs %d, tech %d, remote %d, scholarships %d (total %d) | %s | sources ok: %s | failed: %s | %.0fs" % (
        TODAY.isoformat(), counts_new["jobs"], counts_new["tech"], counts_new["remote"], counts_new["scholarships"], len(new),
        site, ", ".join("%s (%s)" % (n, STATUS[n][3:]) for n in ok_src) or "none", "; ".join(bad_src) or "none", time.time() - T0))
    return exit_code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # never crash the daily run without a line saying why
        print("youth-jobs FAILED before import: %s" % e)
        sys.exit(0)
