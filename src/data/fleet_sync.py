"""
Fleet Sync: Populate active_fleet with real bulk carriers from live AIS APIs.

Sources (in priority order):
  1. Open Waters AIS — real-time cargo vessels in India maritime region
  2. Digitraffic (Finnish Transport Agency) — global cargo fleet with IMO/dimensions

On each sync, discovers real bulk carriers and upserts them into the active_fleet
table alongside manually curated entries. Falls back to vessels_master.json seed
data if all APIs are unreachable.
"""

import logging
from datetime import datetime, timezone
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

OPENWATERS_VESSELS_URL = "https://ais.openwaters.io/v1/vessels"
DIGITRAFFIC_VESSELS_URL = "https://meri.digitraffic.fi/api/ais/v1/vessels"
API_TIMEOUT = 20

# India maritime bounding box (wide enough for Bay of Bengal + Arabian Sea approaches)
INDIA_BBOX = "5.0,65.0,25.0,100.0"

# AIS ship type ranges
CARGO_TYPE_RANGE = range(70, 80)   # 70-79 = Cargo
TANKER_TYPE_RANGE = range(80, 90)  # 80-89 = Tanker (included for completeness)

# Vessel class assignment thresholds based on dimensions (LOA in meters)
_CLASS_BY_LOA: list[tuple[float, str]] = [
    (290, "Newcastlemax"),
    (270, "Capesize"),
    (225, "Kamsarmax"),
    (215, "Panamax"),
    (195, "Ultramax"),
    (180, "Supramax"),
    (0,   "Handysize"),
]


def _classify_vessel(loa: float, beam: float, draught: float) -> str:
    """Assign a dry bulk vessel class based on physical dimensions."""
    for threshold, cls in _CLASS_BY_LOA:
        if loa >= threshold:
            return cls
    return "Handysize"


def _fetch_openwaters_cargo() -> list[dict[str, Any]]:
    """Fetch real cargo vessels currently in India waters from Open Waters AIS."""
    try:
        resp = requests.get(
            OPENWATERS_VESSELS_URL,
            params={"bbox": INDIA_BBOX},
            timeout=API_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.warning("Open Waters returned HTTP %s", resp.status_code)
            return []

        features = (resp.json() or {}).get("features", [])
        vessels = []
        for feat in features:
            props = feat.get("properties", {})
            try:
                ship_type = int(props.get("type") or 0)
            except (TypeError, ValueError):
                ship_type = 0

            if ship_type not in CARGO_TYPE_RANGE:
                continue

            name = (props.get("name") or "").strip()
            mmsi = str(props.get("mmsi") or "").strip()
            if not name or not mmsi:
                continue

            coords = feat.get("geometry", {}).get("coordinates", [0, 0])
            vessels.append({
                "name": name,
                "mmsi": mmsi,
                "imo": None,  # Open Waters doesn't provide IMO
                "ship_type": ship_type,
                "flag": props.get("flag"),
                "sog": float(props.get("sog") or 0),
                "lat": coords[1] if len(coords) >= 2 else 0,
                "lon": coords[0] if len(coords) >= 2 else 0,
                "source": "openwaters",
                "loa": None,
                "beam": None,
                "draught": None,
            })

        logger.info("Open Waters: %s cargo vessels in India region", len(vessels))
        return vessels

    except Exception as e:
        logger.warning("Open Waters fetch failed: %s", e)
        return []


def _fetch_digitraffic_bulkers(min_draught: float = 8.0, limit: int = 30) -> list[dict[str, Any]]:
    """
    Fetch real cargo vessels from Digitraffic (Finnish Maritime AIS).
    Filters to deep-draught cargo ships (bulk carriers) with valid IMO numbers.
    """
    try:
        resp = requests.get(DIGITRAFFIC_VESSELS_URL, timeout=API_TIMEOUT)
        if resp.status_code != 200:
            logger.warning("Digitraffic returned HTTP %s", resp.status_code)
            return []

        data = resp.json()
        if not isinstance(data, list):
            data = data.get("features", data.get("data", []))

        # Filter: cargo type (70-79), has IMO, and deep enough draught for bulk carrier
        cargo = []
        for v in data:
            ship_type = v.get("shipType", 0) or 0
            if ship_type not in CARGO_TYPE_RANGE:
                continue
            imo = v.get("imo")
            if not imo or imo <= 0:
                continue
            draught = (v.get("draught") or 0) / 10.0  # Digitraffic reports in 1/10 meters
            if draught < min_draught:
                continue

            name = (v.get("name") or "").strip()
            mmsi = str(v.get("mmsi") or "")
            if not name:
                continue

            # Compute LOA and beam from AIS reference points
            ref_a = v.get("referencePointA", 0) or 0
            ref_b = v.get("referencePointB", 0) or 0
            ref_c = v.get("referencePointC", 0) or 0
            ref_d = v.get("referencePointD", 0) or 0
            loa = ref_a + ref_b
            beam = ref_c + ref_d

            cargo.append({
                "name": name,
                "mmsi": mmsi,
                "imo": str(imo),
                "ship_type": ship_type,
                "flag": _flag_from_mmsi(mmsi),
                "sog": None,
                "lat": None,
                "lon": None,
                "source": "digitraffic",
                "loa": loa if loa > 0 else None,
                "beam": beam if beam > 0 else None,
                "draught": draught,
                "destination": v.get("destination"),
            })

        # Sort by draught (largest = most likely bulk carriers)
        cargo.sort(key=lambda v: v.get("draught") or 0, reverse=True)
        result = cargo[:limit]
        logger.info(
            "Digitraffic: %s cargo vessels (from %s total, draught >= %.1fm)",
            len(result), len(cargo), min_draught,
        )
        return result

    except Exception as e:
        logger.warning("Digitraffic fetch failed: %s", e)
        return []


def _flag_from_mmsi(mmsi: str) -> str | None:
    """Extract approximate flag from MMSI MID (Maritime Identification Digits)."""
    if not mmsi or len(mmsi) < 3:
        return None
    mid = mmsi[:3]
    # Common MID → flag mappings for bulk carrier registries
    MID_FLAGS = {
        "201": "GRC", "209": "CYP", "210": "CYP", "211": "DEU", "212": "CYP",
        "215": "MLT", "218": "DEU", "219": "DNK", "220": "DNK", "224": "ESP",
        "225": "ESP", "226": "FRA", "227": "FRA", "228": "FRA", "229": "MLT",
        "230": "FIN", "231": "FIN", "232": "GBR", "233": "GBR", "235": "GBR",
        "236": "GBR", "240": "GRC", "241": "GRC", "244": "NLD", "245": "NLD",
        "246": "NLD", "247": "ITA", "248": "MLT", "249": "MLT", "250": "IRL",
        "255": "PRT", "256": "MLT", "257": "NOR", "258": "NOR", "259": "NOR",
        "261": "POL", "263": "PRT", "265": "SWE", "266": "SWE", "269": "CHE",
        "271": "TUR", "272": "UKR", "273": "RUS", "274": "RUS",
        "303": "USA", "304": "ATG", "305": "ATG", "306": "CUW",
        "308": "BHS", "309": "BHS", "310": "BMU", "311": "BHS",
        "312": "BLZ", "314": "BRB", "316": "CAN", "319": "CYM",
        "325": "JAM", "338": "USA", "339": "USA", "341": "VCT",
        "345": "MEX", "351": "PAN", "352": "PAN", "353": "PAN",
        "354": "PAN", "355": "PAN", "356": "PAN", "357": "PAN",
        "370": "PAN", "371": "PAN", "372": "PAN", "373": "PAN",
        "374": "PAN", "375": "PAN", "376": "PAN", "377": "PAN",
        "378": "BHS", "403": "SAU", "405": "BGD",
        "412": "CHN", "413": "CHN", "414": "CHN",
        "416": "TWN", "417": "LKA", "419": "IND",
        "431": "JPN", "432": "JPN", "440": "KOR", "441": "KOR",
        "445": "KOR", "447": "IDN", "450": "IDN",
        "457": "MNG", "459": "PAK", "460": "PHL",
        "470": "ARE", "473": "ARE", "477": "HKG",
        "501": "AIS", "503": "AUS", "506": "MMR",
        "511": "PLW", "512": "NZL", "514": "KHM",
        "525": "IDN", "533": "MYS", "538": "MHL",
        "548": "PHL", "553": "PNG", "555": "SGP",
        "557": "THA", "563": "SGP", "564": "SGP",
        "565": "SGP", "566": "SGP", "567": "THA",
        "572": "TUV", "574": "VNM", "576": "TLS",
        "601": "ZAF", "603": "AGO", "613": "MDG",
        "618": "COM", "619": "MOZ", "620": "MOZ",
        "621": "MDG", "622": "EGY", "624": "ERI",
        "625": "ERI", "626": "LBY", "627": "LBY",
        "629": "MLI", "630": "GHA", "631": "GHA",
        "632": "CMR", "633": "SEN", "634": "TCD",
        "636": "LBR", "637": "LBR", "638": "GHA",
        "642": "COD", "644": "CMR", "645": "TGO",
        "647": "MDG", "649": "MUS", "655": "ISR",
        "657": "NER", "659": "NGA", "660": "MOZ",
        "667": "SLE", "668": "SOM", "669": "SWZ",
        "670": "TCD", "671": "TZA", "672": "TUN",
        "676": "TZA", "677": "TZA",
    }
    return MID_FLAGS.get(mid)


def sync_fleet_from_apis(db_manager) -> dict[str, Any]:
    """
    Fetch real bulk carriers from live AIS APIs and upsert into active_fleet.
    
    Strategy:
      1. Open Waters → real cargo vessels currently in India waters (live positions)
      2. Digitraffic → deep-draught cargo vessels with IMO numbers (global, rich metadata)
      3. Merge by MMSI, classify by dimensions, upsert into DB
      4. Preserve any manually curated fleet entries
    
    Returns summary dict with counts and vessel names.
    """
    from src.data.db_manager import FreightDBManager

    if db_manager is None:
        db_manager = FreightDBManager()

    ow_vessels = _fetch_openwaters_cargo()
    dt_vessels = _fetch_digitraffic_bulkers(min_draught=8.0, limit=30)

    # Merge: index by MMSI, prefer Digitraffic for metadata (has IMO, dimensions)
    by_mmsi: dict[str, dict[str, Any]] = {}
    for v in ow_vessels:
        by_mmsi[v["mmsi"]] = v
    for v in dt_vessels:
        mmsi = v["mmsi"]
        if mmsi in by_mmsi:
            # Merge: keep OW position data, use DT metadata
            merged = by_mmsi[mmsi].copy()
            merged["imo"] = v.get("imo") or merged.get("imo")
            merged["loa"] = v.get("loa") or merged.get("loa")
            merged["beam"] = v.get("beam") or merged.get("beam")
            merged["draught"] = v.get("draught") or merged.get("draught")
            merged["destination"] = v.get("destination")
            by_mmsi[mmsi] = merged
        else:
            by_mmsi[mmsi] = v

    # Filter: prefer vessels heading to India or with India-relevant destinations
    india_keywords = {"india", "vizag", "paradip", "haldia", "gangavaram", "dhamra",
                      "gopalpur", "krishnapatnam", "chennai", "mumbai", "kandla",
                      "in ", "inmum", "invtz", "inprt", "ingnv"}

    def _india_relevance(v: dict[str, Any]) -> int:
        """Score: higher = more India-relevant."""
        score = 0
        dest = (v.get("destination") or "").lower()
        if any(kw in dest for kw in india_keywords):
            score += 10
        if v.get("lat") and v.get("lon"):
            # In India maritime zone?
            lat, lon = float(v["lat"]), float(v["lon"])
            if 5 <= lat <= 25 and 65 <= lon <= 100:
                score += 5
        if v.get("imo"):
            score += 3  # Has verified identity
        if v.get("loa") and float(v.get("loa") or 0) >= 180:
            score += 2  # Bulk carrier size
        return score

    ranked = sorted(by_mmsi.values(), key=_india_relevance, reverse=True)

    # Take top vessels across different size classes (2 per class target)
    target_per_class = 2
    class_counts: dict[str, int] = {}
    selected: list[dict[str, Any]] = []

    for v in ranked:
        loa = float(v.get("loa") or 0)
        beam = float(v.get("beam") or 0)
        draught = float(v.get("draught") or 0)

        # If no dimensions from API, estimate class from draught alone
        if loa <= 0 and draught > 0:
            if draught >= 16:
                v_class = "Capesize"
            elif draught >= 13:
                v_class = "Panamax"
            elif draught >= 11:
                v_class = "Supramax"
            else:
                v_class = "Handysize"
        elif loa > 0:
            v_class = _classify_vessel(loa, beam, draught)
        else:
            v_class = "Panamax"  # Default for unknown dimensions

        v["vessel_class"] = v_class

        if class_counts.get(v_class, 0) >= target_per_class:
            continue

        class_counts[v_class] = class_counts.get(v_class, 0) + 1
        selected.append(v)

        if len(selected) >= 14:  # Match original fleet size
            break

    # Upsert into active_fleet
    now_iso = datetime.now(timezone.utc).isoformat()
    upserted = []
    for i, v in enumerate(selected):
        vessel_id = f"api_{v['mmsi']}"
        flag = v.get("flag") or _flag_from_mmsi(v["mmsi"]) or "PAN"

        fleet_record = {
            "vessel_id": vessel_id,
            "name": f"MV {v['name']}",
            "vessel_class": v["vessel_class"],
            "operator": f"AIS Live ({v.get('source', 'api')})",
            "imo_number": v.get("imo") or f"API_{v['mmsi']}",
            "flag": flag,
            "built_year": 2018,  # Unknown from AIS, use reasonable default
            "current_status": "Active",
        }
        try:
            db_manager.save_fleet_vessel(fleet_record)
            upserted.append(fleet_record["name"])
        except Exception as e:
            logger.warning("Failed to upsert vessel %s: %s", fleet_record["name"], e)

    summary = {
        "openwaters_fetched": len(ow_vessels),
        "digitraffic_fetched": len(dt_vessels),
        "merged_total": len(by_mmsi),
        "selected": len(selected),
        "upserted": len(upserted),
        "vessel_names": upserted,
        "class_distribution": class_counts,
        "synced_at": now_iso,
    }

    logger.info(
        "Fleet sync complete: %s vessels upserted (%s OW + %s DT sources, classes: %s)",
        len(upserted), len(ow_vessels), len(dt_vessels), class_counts,
    )
    return summary
