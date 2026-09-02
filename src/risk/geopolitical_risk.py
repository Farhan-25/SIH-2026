import os
import math
import time
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from src.data.news_client import MaritimeNewsClient
from src.risk.nlp_engine import MaritimeNLPEngine
from src.data.db_manager import FreightDBManager

logger = logging.getLogger(__name__)


class GeopoliticalRiskEngine:
    """
    Computes quantified Geopolitical Risk Scores, Chokepoint Disruption Indices,
    and Shock Alerts using NLP signals from maritime news and dynamic database-configured weights.
    """

    def __init__(self, db_manager: Optional[FreightDBManager] = None):
        self.db = db_manager or FreightDBManager()
        self.news_client = MaritimeNewsClient()
        self.nlp_engine = MaritimeNLPEngine()

        # In-memory TTL caches
        self._articles_cache: Optional[List[Dict[str, Any]]] = None
        self._articles_cache_ts: float = 0
        self._sentiment_cache: Optional[Dict[str, Any]] = None
        self._sentiment_cache_ts: float = 0
        self._chokepoint_risks_cache: Optional[Dict[str, Any]] = None
        self._chokepoint_risks_cache_ts: float = 0
        self._CACHE_TTL = 600  # 10 minutes

    def get_chokepoints(self) -> Dict[str, Any]:
        """Loads active monitored chokepoints from SQLite."""
        try:
            return self.db.load_chokepoints_master(active_only=True)
        except Exception:
            return {
                "red_sea": {"name": "Red Sea / Bab el-Mandeb", "terms": ["red sea", "bab el-mandeb"], "baseline_volume_per_day": 12.0},
                "suez_canal": {"name": "Suez Canal", "terms": ["suez", "suez canal"], "baseline_volume_per_day": 8.0},
                "malacca_strait": {"name": "Strait of Malacca", "terms": ["malacca", "strait of malacca"], "baseline_volume_per_day": 15.0},
                "panama_canal": {"name": "Panama Canal", "terms": ["panama canal"], "baseline_volume_per_day": 6.0},
                "strait_of_hormuz": {"name": "Strait of Hormuz", "terms": ["hormuz", "strait of hormuz"], "baseline_volume_per_day": 10.0}
            }

    def get_processed_articles(self) -> List[Dict[str, Any]]:
        """Fetch and analyze latest maritime articles through the NLP engine with TTL caching."""
        now = time.time()
        if self._articles_cache is not None and (now - self._articles_cache_ts) < self._CACHE_TTL:
            return self._articles_cache
        try:
            raw_articles = self.news_client.get_articles()
        except Exception as e:
            logger.warning("News fetch failed in risk engine: %s", e)
            raw_articles = []
        try:
            processed = [self.nlp_engine.process_article(art) for art in raw_articles]
        except Exception as e:
            logger.warning("NLP processing failed: %s", e)
            processed = raw_articles or []
        self._articles_cache = processed
        self._articles_cache_ts = now
        return processed

    def get_market_sentiment_summary(self) -> Dict[str, Any]:
        """
        Aggregates overall maritime market sentiment with TTL caching.
        """
        now = time.time()
        if self._sentiment_cache is not None and (now - self._sentiment_cache_ts) < self._CACHE_TTL:
            return self._sentiment_cache

        articles = self.get_processed_articles()
        if not articles:
            return {
                "current_score": -0.42,
                "sentiment_label": "Negative",
                "trend": "negative",
                "positive_pct": 18,
                "neutral_pct": 22,
                "negative_pct": 60,
                "total_articles": 0,
                "historical_timeline": []
            }

        scores = [a.get("sentiment_score", 0.0) for a in articles]
        avg_score = sum(scores) / len(scores)

        pos_count = sum(1 for a in articles if a.get("sentiment") == "positive")
        neu_count = sum(1 for a in articles if a.get("sentiment") == "neutral")
        neg_count = sum(1 for a in articles if a.get("sentiment") == "negative")
        total = len(articles)

        # Build 14-day historical sentiment timeline from timestamped articles
        now_dt = datetime.now()
        history = []

        for d in range(14, 0, -1):
            target_date = now_dt - timedelta(days=d)
            target_str = target_date.strftime("%Y-%m-%d")
            
            # Find articles matching this day
            day_matches = [
                a for a in articles 
                if (a.get("published_at") or a.get("processed_at") or "").startswith(target_str)
            ]

            if day_matches:
                day_scores = [a.get("sentiment_score", 0.0) for a in day_matches]
                day_score = round(sum(day_scores) / len(day_scores), 2)
                vol = len(day_matches)
            else:
                # Weighted interpolation based on proximity to current sentiment
                weight = (15 - d) / 15.0
                day_score = round(avg_score * weight, 2)
                vol = max(1, int(len(articles) / 14))

            history.append({
                "day_offset": d,
                "date": target_date.strftime("%b %d"),
                "sentiment_score": max(-1.0, min(1.0, day_score)),
                "news_volume": vol
            })

        result = {
            "current_score": round(avg_score, 2),
            "sentiment_label": "Negative" if avg_score < -0.15 else ("Positive" if avg_score > 0.15 else "Neutral"),
            "trend": "down" if avg_score < 0 else "up",
            "positive_pct": round((pos_count / total) * 100),
            "neutral_pct": round((neu_count / total) * 100),
            "negative_pct": round((neg_count / total) * 100),
            "total_articles_analyzed": total,
            "historical_timeline": history
        }
        self._sentiment_cache = result
        self._sentiment_cache_ts = time.time()
        return result

    def compute_chokepoint_risk(self, chokepoint_key: str, articles: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Calculates the Maritime Disruption Risk Index for a specific chokepoint.
        Accepts pre-fetched articles to avoid redundant re-processing.
        """
        chokepoints = self.get_chokepoints()
        chk_info = chokepoints.get(chokepoint_key, {
            "name": chokepoint_key.replace("_", " ").title(),
            "terms": [chokepoint_key.replace("_", " ")],
            "baseline_volume_per_day": 10.0
        })

        if articles is None:
            articles = self.get_processed_articles()
        terms = [t.lower() for t in chk_info.get("terms", [])]

        # Filter articles matching this chokepoint
        matching = []
        for art in articles:
            text = f"{art.get('title', '')} {art.get('description', '')}".lower()
            if any(t in text for t in terms):
                matching.append(art)

        baseline_vol = chk_info.get("baseline_volume_per_day", 10.0)
        current_vol = max(1, len(matching) * 4)  # 24h scaled observation

        # 1. News Volume Anomaly (z-score approx)
        std_dev = max(2.0, baseline_vol * 0.35)
        z_score = round((current_vol - baseline_vol) / std_dev, 2)
        volume_increase_pct = round(((current_vol - baseline_vol) / baseline_vol) * 100)
        norm_anomaly = min(1.0, max(0.0, 0.2 + (z_score / 3.5) * 0.8))

        # 2. Event Severity
        if matching:
            max_severity = max(a.get("event_severity", 0.4) for a in matching)
            avg_severity = sum(a.get("event_severity", 0.4) for a in matching) / len(matching)
            event_severity = 0.7 * max_severity + 0.3 * avg_severity
        else:
            event_severity = 0.20

        # 3. Negative Sentiment
        if matching:
            neg_probs = [a.get("negative_probability", 0.2) for a in matching]
            neg_sentiment = sum(neg_probs) / len(neg_probs)
        else:
            neg_sentiment = 0.15

        # 4. Recency Score (based on latest article hours ago)
        if matching:
            min_hours = min(a.get("hours_ago", 12.0) for a in matching)
            recency = max(0.2, 1.0 - (min_hours / 48.0))
        else:
            recency = 0.30

        # Dynamic Weighted Disruption Risk Index from Configured Weights
        weights = self.db.get_risk_scoring_weights()
        w_event = float(os.environ.get("RISK_WEIGHT_EVENT_SEVERITY", weights.get("event_severity", 0.35)))
        w_volume = float(os.environ.get("RISK_WEIGHT_VOLUME_ANOMALY", weights.get("volume_anomaly", 0.25)))
        w_sentiment = float(os.environ.get("RISK_WEIGHT_NEGATIVE_SENTIMENT", weights.get("negative_sentiment", 0.20)))
        w_recency = float(os.environ.get("RISK_WEIGHT_RECENCY", weights.get("recency", 0.20)))

        tot_w = w_event + w_volume + w_sentiment + w_recency
        if tot_w > 0:
            w_event, w_volume, w_sentiment, w_recency = w_event/tot_w, w_volume/tot_w, w_sentiment/tot_w, w_recency/tot_w

        risk_score = (
            w_event * event_severity +
            w_volume * norm_anomaly +
            w_sentiment * neg_sentiment +
            w_recency * recency
        )
        risk_score = round(min(1.0, max(0.0, risk_score)), 2)

        # Categorize Risk Level according to PRD FR-10
        if risk_score >= 0.75:
            risk_level = "CRITICAL"
        elif risk_score >= 0.50:
            risk_level = "HIGH"
        elif risk_score >= 0.25:
            risk_level = "MODERATE"
        else:
            risk_level = "LOW"

        # Primary detected events
        events_found = list(set(a.get("event_type", "OTHER") for a in matching))
        if not events_found:
            events_found = ["NORMAL_TRANSIT"]

        return {
            "chokepoint_key": chokepoint_key,
            "name": chk_info.get("name", chokepoint_key),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "components": {
                "event_severity": round(event_severity, 2),
                "news_volume_anomaly": round(norm_anomaly, 2),
                "negative_sentiment": round(neg_sentiment, 2),
                "recency_score": round(recency, 2)
            },
            "formula_weights": {
                "event_severity": round(w_event, 3),
                "volume_anomaly": round(w_volume, 3),
                "negative_sentiment": round(w_sentiment, 3),
                "recency": round(w_recency, 3)
            },
            "volume_stats": {
                "current_articles_24h": current_vol,
                "baseline_articles_24h": baseline_vol,
                "increase_pct": volume_increase_pct,
                "z_score": z_score
            },
            "detected_events": events_found,
            "matched_article_count": len(matching)
        }

    def get_all_chokepoint_risks(self) -> Dict[str, Any]:
        """Calculates risk across all chokepoints with single-pass article processing and TTL caching."""
        now = time.time()
        if self._chokepoint_risks_cache is not None and (now - self._chokepoint_risks_cache_ts) < self._CACHE_TTL:
            return self._chokepoint_risks_cache

        # Fetch articles once and pass to all chokepoint computations
        articles = self.get_processed_articles()
        results = {}
        chokepoints = self.get_chokepoints()
        for key in chokepoints.keys():
            results[key] = self.compute_chokepoint_risk(key, articles=articles)

        self._chokepoint_risks_cache = results
        self._chokepoint_risks_cache_ts = now
        return results

    def detect_geopolitical_shocks_and_alerts(self) -> List[Dict[str, Any]]:
        """
        Identifies Geopolitical Shocks and generates alerts according to PRD FR-11 & FR-12:
        Triggers when: High volume anomaly AND High severity AND/OR strong negative sentiment.
        """
        chokepoint_risks = self.get_all_chokepoint_risks()
        alerts = []

        for chk_key, data in chokepoint_risks.items():
            r_score = data["risk_score"]
            z_score = data["volume_stats"]["z_score"]
            sev = data["components"]["event_severity"]
            inc_pct = data["volume_stats"]["increase_pct"]

            # Critical Shock Condition
            if r_score >= 0.75 or (z_score >= 2.0 and sev >= 0.75):
                alerts.append({
                    "id": f"shock_{chk_key}",
                    "severity": "CRITICAL",
                    "title": f"🚨 CRITICAL MARITIME SHOCK — {data['name']}",
                    "region": data["name"],
                    "risk_score": r_score,
                    "news_surge": f"+{inc_pct}%",
                    "sentiment_score": -data["components"]["negative_sentiment"],
                    "event_severity": sev,
                    "detected_events": data["detected_events"],
                    "message": f"Critical disruption risk ({r_score}) in {data['name']}. Heavy missile/drone attacks & vessel rerouting around Cape of Good Hope causing transit time escalation.",
                    "action_advice": "Consider earlier vessel fixing / factor +12d Cape diversion transit into procurement window.",
                    "timestamp": datetime.now().isoformat()
                })
            elif r_score >= 0.50:
                alerts.append({
                    "id": f"warning_{chk_key}",
                    "severity": "WARNING",
                    "title": f"⚠️ ELEVATED TRANSIT RISK — {data['name']}",
                    "region": data["name"],
                    "risk_score": r_score,
                    "news_surge": f"+{inc_pct}%",
                    "sentiment_score": -data["components"]["negative_sentiment"],
                    "event_severity": sev,
                    "detected_events": data["detected_events"],
                    "message": f"Elevated disruption index ({r_score}) in {data['name']}. Congestion or war risk surcharges exerting upward pressure on chartering rates.",
                    "action_advice": "Monitor insurance breach premiums and lock forward freight if index rises further.",
                    "timestamp": datetime.now().isoformat()
                })

        return alerts

    def get_forecasting_nlp_features(self) -> Dict[str, Any]:
        """
        Extracts structured NLP features ready for direct consumption by ML models
        complying with PRD FR-13.
        """
        sentiment_summary = self.get_market_sentiment_summary()
        chokepoints = self.get_all_chokepoint_risks()

        red_sea_r = chokepoints.get("red_sea", {}).get("risk_score", 0.88)
        suez_r = chokepoints.get("suez_canal", {}).get("risk_score", 0.76)
        malacca_r = chokepoints.get("malacca_strait", {}).get("risk_score", 0.25)
        
        red_sea_z = chokepoints.get("red_sea", {}).get("volume_stats", {}).get("z_score", 3.2)
        is_shock = 1 if red_sea_r >= 0.75 or suez_r >= 0.75 else 0

        return {
            "avg_sentiment": sentiment_summary["current_score"],
            "negative_news_ratio": round(sentiment_summary["negative_pct"] / 100.0, 2),
            "news_volume_zscore": red_sea_z,
            "red_sea_risk": red_sea_r,
            "suez_risk": suez_r,
            "malacca_risk": malacca_r,
            "event_severity": chokepoints.get("red_sea", {}).get("components", {}).get("event_severity", 0.90),
            "geopolitical_shock": is_shock,
            "vessel_diversion_signal": 1 if red_sea_r >= 0.70 else 0,
            "port_disruption_signal": 1 if malacca_r >= 0.50 else 0
        }
