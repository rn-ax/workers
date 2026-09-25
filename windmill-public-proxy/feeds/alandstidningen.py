# Ported from monocoque/apps/newshound/feeds/services/alandstidningen.py.
# Deployed as a Windmill script (f/feeds/alandstidningen), served publicly via
# wm.rn.ax/p/f/feeds/alandstidningen -> windmill-public-proxy -> this script's
# sync run_wait_result endpoint. See the windmill skill's "Public HTTP-triggered
# flows" section for the best-effort caching design this implements.
import time
import xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime

import requests
from bs4 import BeautifulSoup
from wmill import get_state, set_state

UPSTREAM_URL = "https://feed.alandstidningen.ax/rss/nyheter"
PAYWALL_EMOJI = "🔒"
FEED_TITLE = "Ålandstidningen"
FEED_HOME_PAGE_URL = "https://www.alandstidningen.ax/"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; newshound/1.0)"}
CACHE_TTL_SECONDS = 24 * 3600
# Leaves margin under Windmill's 20s sync (run_wait_result) timeout for the
# RSS fetch, response serialization, and network round-trip back through the
# proxy Worker to the caller.
TIME_BUDGET_SECONDS = 15

_NS = {
    "dc": "http://purl.org/dc/elements/1.1/",
}


def main():
    start = time.monotonic()
    cache = get_state() or {}

    resp = requests.get(UPSTREAM_URL, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    channel = root.find("channel")

    items = []
    cache_dirty = False

    for entry in channel.findall("item"):
        url = _text(entry, "link")
        if not url:
            continue

        title = _text(entry, "title") or ""
        summary = _text(entry, "description")
        pub_date = _parse_date(_text(entry, "pubDate"))
        author = _text(entry, "dc:creator", _NS)
        guid = _text(entry, "guid")
        enclosure = entry.find("enclosure")
        image = enclosure.get("url") if enclosure is not None else None

        cached = cache.get(url)
        fresh = cached is not None and (time.time() - cached["checked_at"]) < CACHE_TTL_SECONDS

        if fresh:
            paywalled = cached["is_paywalled"]
            content_html = cached["content_html"]
        elif time.monotonic() - start < TIME_BUDGET_SECONDS:
            # Stale or missing: try a live fetch. On success or failure, fall
            # back to whatever's cached (even if stale) rather than clobbering
            # prior good content with a transient fetch failure.
            fetched = _fetch_article(url)
            if fetched is not None:
                paywalled, content_html = fetched
                cache[url] = {
                    "is_paywalled": paywalled,
                    "content_html": content_html,
                    "checked_at": int(time.time()),
                }
                cache_dirty = True
                # Persist incrementally so a mid-run timeout still leaves
                # already-fetched items cached for the next poll to build on.
                set_state(cache)
            elif cached is not None:
                paywalled, content_html = cached["is_paywalled"], cached["content_html"]
            else:
                continue
        elif cached is not None:
            # Out of time budget for this run; fall back to stale cache.
            paywalled, content_html = cached["is_paywalled"], cached["content_html"]
        else:
            # No cache and no time left to fetch: skip rather than crash.
            continue

        if paywalled:
            title = f"{PAYWALL_EMOJI} {title}"

        item = {
            "id": guid or url,
            "url": url,
            "title": title,
            "content_html": content_html,
            "content_text": "",
        }
        if summary is not None:
            item["summary"] = summary
        if pub_date is not None:
            item["date_published"] = pub_date.isoformat()
        if author:
            item["authors"] = [{"name": author}]
        if image is not None:
            item["image"] = image
        items.append(item)

    if cache_dirty:
        set_state(cache)

    return {
        "version": "https://jsonfeed.org/version/1.1",
        "title": FEED_TITLE,
        "home_page_url": FEED_HOME_PAGE_URL,
        "feed_url": "https://wm.rn.ax/p/f/feeds/alandstidningen",
        "items": items,
    }


def _fetch_article(url: str):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        return _parse_article(resp.text)
    except Exception:
        return None


def _parse_article(html: str):
    soup = BeautifulSoup(html, "html.parser")

    header_el = soup.select_one(".articleHeader")
    body_el = soup.select_one(".bodytext")

    if header_el is None and body_el is None:
        return None

    paywalled = bool(body_el and body_el.select_one(".paywallTeaser"))

    header_html = ""
    if header_el:
        for tag in header_el.select("script"):
            tag.decompose()
        for tag in header_el.select("h1.headline"):
            tag.decompose()
        for tag in header_el.select(".meta"):
            tag.decompose()
        _enhance_images(soup, header_el)
        header_html = header_el.decode_contents().strip()

    body_html = ""
    if body_el:
        for tag in body_el.select("script"):
            tag.decompose()
        for tag in body_el.select(".factbox"):
            tag.decompose()
        for tag in body_el.select(".paywallTeaser"):
            tag.replace_with(BeautifulSoup("<p>💰 PAYWALL 💰</p>", "html.parser"))
        _enhance_images(soup, body_el)
        body_html = body_el.decode_contents().strip()

    content_html = (header_html + body_html).strip() or None
    if content_html is None:
        return None
    return paywalled, content_html


def _enhance_images(soup: BeautifulSoup, el) -> None:
    for img in el.select("img"):
        src = img.get("src")
        img.attrs.pop("height", None)
        img.attrs.pop("width", None)
        if src:
            a = soup.new_tag("a", href=src, target="_blank")
            img.wrap(a)


def _text(el, tag, ns=None):
    child = el.find(tag, ns) if ns else el.find(tag)
    return child.text if child is not None else None


def _parse_date(value):
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc)
    except Exception:
        return None
