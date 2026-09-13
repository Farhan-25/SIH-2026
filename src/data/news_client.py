"""
Maritime News Client & Ingestion Engine.
Collects shipping news from public RSS / GDELT sources.
Returns only real articles — no hardcoded fallback data.
"""

import concurrent.futures
import hashlib
import logging
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

import requests

from src.data.db_manager import FreightDBManager

logger = logging.getLogger(__name__)

# Keywords for maritime and shipping relevance filtering
MARITIME_KEYWORDS = {
    "high": [
        "shipping", "vessel", "bulk carrier", "capesize", "panamax", "supramax",
        "freight", "charter", "cargo", "port", "suez", "red sea", "bab el-mandeb",
        "malacca", "bunker", "demurrage", "anchorage", "baltic exchange", "bdi"
    ],
    "medium": [
        "sanctions", "strike", "congestion", "diversion", "canal", "piracy",
        "attack", "houthi", "drone", "missile", "chokepoint", "strait", "cape of good hope",
        "trade route", "transit", "iron ore", "coking coal", "thermal coal"
    ],
    "low": [
        "commodity", "tariff", "oil tanker", "dry bulk", "maritime", "dockers",
        "customs", "export", "import", "supply chain", "logistics"
    ]
}

# Monitored Maritime Chokepoints (loaded dynamically from FreightDBManager)
try:
    _db_mgr = FreightDBManager()
    CHOKEPOINTS = _db_mgr.load_chokepoints_master()
except Exception:
    CHOKEPOINTS = {
        "red_sea": {
            "name": "Red Sea / Bab el-Mandeb",
            "terms": ["red sea", "bab el-mandeb", "bab-el-mandeb", "yemen", "houthi", "gulf of aden", "southern red sea"],
            "baseline_volume_per_day": 12.0
        },
        "suez_canal": {
            "name": "Suez Canal",
            "terms": ["suez", "suez canal", "ever given", "sczone", "port said"],
            "baseline_volume_per_day": 8.0
        },
        "malacca_strait": {
            "name": "Strait of Malacca",
            "terms": ["malacca", "strait of malacca", "singapore strait", "phillip channel", "malacca straits"],
            "baseline_volume_per_day": 15.0
        },
        "panama_canal": {
            "name": "Panama Canal",
            "terms": ["panama canal", "gatun lake", "panama transit", "draft restriction panama"],
            "baseline_volume_per_day": 6.0
        },
        "strait_of_hormuz": {
            "name": "Strait of Hormuz",
            "terms": ["hormuz", "strait of hormuz", "persian gulf", "gulf of oman"],
            "baseline_volume_per_day": 10.0
        }
    }


class MaritimeNewsClient:
    """Client for collecting, filtering, and caching real maritime news articles."""

    RSS_FEEDS = [
        {"name": "gCaptain", "url": "https://gcaptain.com/feed/"},
        {"name": "Splash247", "url": "https://splash247.com/feed/"},
        {"name": "Maritime Executive", "url": "https://www.maritime-executive.com/articles.rss"},
        {"name": "Hellenic Shipping News", "url": "https://www.hellenicshippingnews.com/feed/"},
        {"name": "Seatrade Maritime News", "url": "https://www.seatrade-maritime.com/rss.xml"},
    ]

    GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"

    # Global class-level singleton cache across all instances
    _GLOBAL_CACHE: list[dict[str, Any]] = []
    _GLOBAL_LAST_FETCH = 0.0
    _REFRESH_LOCK = threading.Lock()

    def __init__(self, cache_ttl_seconds: int = 900, db_manager: FreightDBManager | None = None):
        self.cache_ttl = cache_ttl_seconds
        self.db = db_manager or FreightDBManager()

    def get_articles(self, force_refresh: bool = False) -> list[dict[str, Any]]:
        """Retrieve deduplicated, relevance-filtered real maritime news articles."""
        current_time = time.time()
        if not force_refresh and MaritimeNewsClient._GLOBAL_CACHE and (current_time - MaritimeNewsClient._GLOBAL_LAST_FETCH < self.cache_ttl):
            return MaritimeNewsClient._GLOBAL_CACHE

        # Serialize refresh — Risk page fires news/sentiment/chokepoint/alerts together
        with MaritimeNewsClient._REFRESH_LOCK:
            current_time = time.time()
            if not force_refresh and MaritimeNewsClient._GLOBAL_CACHE and (current_time - MaritimeNewsClient._GLOBAL_LAST_FETCH < self.cache_ttl):
                return MaritimeNewsClient._GLOBAL_CACHE

            fetched: list[dict[str, Any]] = []

            def fetch_feed(feed):
                try:
                    res = requests.get(
                        feed["url"],
                        timeout=8,
                        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                    )
                    if res.status_code == 200:
                        return self._parse_rss(res.text, feed["name"])
                except Exception:
                    pass
                return []

            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
                    future_to_feed = {executor.submit(fetch_feed, f): f for f in self.RSS_FEEDS}
                    future_gdelt = executor.submit(self._fetch_gdelt_maritime_news)

                    try:
                        for future in concurrent.futures.as_completed(future_to_feed, timeout=10):
                            try:
                                res = future.result()
                                if res:
                                    fetched.extend(res)
                            except Exception:
                                pass
                    except concurrent.futures.TimeoutError:
                        logger.warning("Maritime RSS fetch timed out; using partial results (%s articles)", len(fetched))
                        for future in future_to_feed:
                            if future.done():
                                try:
                                    res = future.result(timeout=0)
                                    if res:
                                        fetched.extend(res)
                                except Exception:
                                    pass

                    try:
                        gdelt_res = future_gdelt.result(timeout=8)
                        if gdelt_res:
                            fetched.extend(gdelt_res)
                    except Exception:
                        pass
            except Exception as e:
                logger.warning("Maritime news fetch failed: %s", e)

            processed = self._process_and_filter(fetched)

            if not processed:
                # No live articles — return in-memory cache, then DB, never an empty fake feed
                if MaritimeNewsClient._GLOBAL_CACHE:
                    logger.info("Live fetch returned no results; serving %s cached real articles", len(MaritimeNewsClient._GLOBAL_CACHE))
                    return MaritimeNewsClient._GLOBAL_CACHE
                try:
                    db_articles = self.db.get_latest_news_articles(limit=50)
                    if db_articles:
                        logger.info("Live fetch returned no results; serving %s DB-cached articles", len(db_articles))
                        MaritimeNewsClient._GLOBAL_CACHE = db_articles
                        MaritimeNewsClient._GLOBAL_LAST_FETCH = time.time()
                        return db_articles
                except Exception:
                    pass
                logger.warning("No real maritime articles available from any source")
                return []

            MaritimeNewsClient._GLOBAL_CACHE = processed
            MaritimeNewsClient._GLOBAL_LAST_FETCH = time.time()
            try:
                self.db.save_news_articles(processed)
            except Exception:
                pass

            return processed

    def _fetch_gdelt_maritime_news(self) -> list[dict[str, Any]]:
        """Queries the live GDELT 2.0 Doc API for real-time global maritime incidents and disruptions."""
        articles = []
        params = {
            "query": '(shipping OR "bulk carrier" OR "Red Sea" OR "Suez Canal" OR "Malacca Strait" OR "port congestion") tone<-2',
            "mode": "artlist",
            "maxrecords": 25,
            "format": "json",
            "sort": "datechange"
        }
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

        try:
            res = requests.get(self.GDELT_DOC_API, params=params, timeout=5, headers=headers)
            if res.status_code == 200:
                data = res.json()
                for item in data.get("articles", []):
                    title = item.get("title", "").strip()
                    url = item.get("url", "")
                    domain = item.get("domain", "GDELT Global News")
                    seendate = item.get("seendate", "")

                    if title:
                        articles.append({
                            "id": hashlib.md5((title + url).encode("utf-8")).hexdigest()[:12],
                            "title": title,
                            "description": f"Real-time global incident report via {domain}. Maritime news tone: {item.get('tone', '-1.5')}",
                            "raw_text": f"{title}. Reported by {domain}",
                            "source": f"GDELT ({domain})",
                            "url": url,
                            "published_at": seendate or datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT"),
                            "collected_at": datetime.now().isoformat(),
                            "hours_ago": 0.5
                        })
        except Exception as e:
            logger.debug(f"GDELT API error: {e}")

        return articles

    def _parse_rss(self, xml_content: str, source_name: str) -> list[dict[str, Any]]:
        """Parses RSS 2.0 <item> and Atom <entry> XML into standard article objects."""
        articles = []
        try:
            root = ET.fromstring(xml_content)
            for el in root.iter():
                if "}" in el.tag:
                    el.tag = el.tag.split("}", 1)[1]
            items = root.findall(".//item") or root.findall(".//entry")
            for item in items:
                title = (item.findtext("title") or "").strip()
                desc = (item.findtext("description") or item.findtext("summary") or "").strip()
                desc_clean = re.sub(r"<[^>]+>", "", desc)
                link_el = item.find("link")
                if link_el is not None:
                    link = (link_el.get("href") or link_el.text or "").strip()
                else:
                    link = ""
                pub_date = (
                    item.findtext("pubDate")
                    or item.findtext("updated")
                    or item.findtext("published")
                    or datetime.now().strftime("%a, %d %b %Y %H:%M:%S +0000")
                )

                if title:
                    articles.append({
                        "id": hashlib.md5((title + link).encode("utf-8")).hexdigest()[:12],
                        "title": title,
                        "description": desc_clean[:400],
                        "raw_text": f"{title}. {desc_clean}",
                        "source": source_name,
                        "url": link or "",
                        "published_at": pub_date,
                        "collected_at": datetime.now().isoformat()
                    })
        except Exception as e:
            logger.debug(f"Error parsing RSS XML: {e}")
        return articles

    def _process_and_filter(self, raw_articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Filters articles for maritime relevance and removes duplicates."""
        seen_titles = set()
        filtered = []

        for art in raw_articles:
            normalized_title = re.sub(r"[^a-zA-Z0-9]", "", art["title"].lower())
            if normalized_title in seen_titles:
                continue
            seen_titles.add(normalized_title)

            text = f"{art['title']} {art.get('description', '')}".lower()

            high_count = sum(1 for kw in MARITIME_KEYWORDS["high"] if kw in text)
            med_count = sum(1 for kw in MARITIME_KEYWORDS["medium"] if kw in text)
            low_count = sum(1 for kw in MARITIME_KEYWORDS["low"] if kw in text)

            relevance_score = min(1.0, (high_count * 0.25) + (med_count * 0.15) + (low_count * 0.05))

            if relevance_score >= 0.10:
                art_copy = dict(art)
                art_copy["relevance_score"] = round(relevance_score, 2)
                filtered.append(art_copy)

        return filtered
