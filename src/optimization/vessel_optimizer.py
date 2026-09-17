"""
Vessel Type & Port Constraint Optimization Engine (Module B).
Evaluates port draft, LOA, beam, and cargo handling constraints across Indian East Coast
and international load ports to determine feasible vessels and compute total landed logistics cost.
"""

import json
from typing import Any

from src.data.db_manager import FreightDBManager


class VesselConstraintOptimizer:
    """Solves vessel class compatibility and computes full landed chartering costs."""

    def __init__(
        self,
        ports_path: str = "data/reference/ports_master.json",
        vessels_path: str = "data/reference/vessels_master.json",
        routes_path: str = "data/reference/routes_master.json",
        db_manager: FreightDBManager | None = None
    ):
        self.db = db_manager or FreightDBManager()
        try:
            pdata = self.db.load_ports_master()
            self.indian_ports = pdata.get("indian_east_coast_ports", {})
            self.global_ports = pdata.get("global_load_ports", {})
        except Exception:
            with open(ports_path, "r") as f:
                pdata = json.load(f)
                self.indian_ports = pdata["indian_east_coast_ports"]
                self.global_ports = pdata["global_load_ports"]

        try:
            v_data = self.db.load_vessels_master()
            self.vessels = v_data.get("vessel_classes", {})
            self.active_fleet = v_data.get("active_fleet", [])
        except Exception:
            with open(vessels_path, "r") as f:
                v_data = json.load(f)
                self.vessels = v_data["vessel_classes"]
                self.active_fleet = v_data.get("active_fleet", [])

        try:
            self.routes = {r["route_id"]: r for r in self.db.load_routes_master().get("trade_routes", [])}
        except Exception:
            with open(routes_path, "r") as f:
                self.routes = {r["route_id"]: r for r in json.load(f)["trade_routes"]}

    PORT_ALIASES = {
        "newcastle": "AU_NEW",
        "hay_point": "AU_HAY",
        "gladstone": "AU_GLA",
        "norfolk": "US_NOR",
        "baltimore": "US_BAL",
        "kalimantan": "ID_KLT",
        "samarinda": "ID_SMR",
        "beira": "MZ_BEI",
        "nacala": "MZ_NAC",
        "taman": "RU_TAM",
        "vostochny": "RU_VOS",
        "paradip": "IN_PRT",
        "vizag": "IN_VTZ",
        "visakhapatnam": "IN_VTZ",
        "gangavaram": "IN_GNV",
        "gopalpur": "IN_GPL",
        "dhamra": "IN_DHM",
        "haldia": "IN_HLD",
        "sagar_sandheads": "IN_SGR",
        "sagar": "IN_SGR",
    }

    def _resolve_port(self, port_id: str, is_destination: bool = False) -> dict[str, Any] | None:
        """Resolves port ID or name against Indian and Global port records."""
        if not port_id:
            return None
        p_clean = port_id.strip()
        p_lower = p_clean.lower()
        norm_key = self.PORT_ALIASES.get(p_lower, p_clean.upper())

        # Check direct dictionary key
        if is_destination:
            port = self.indian_ports.get(norm_key) or self.global_ports.get(norm_key)
        else:
            port = self.global_ports.get(norm_key) or self.indian_ports.get(norm_key)

        if port:
            return port

        # Case-insensitive search across keys & names
        all_ports = {**self.global_ports, **self.indian_ports}
        for k, v in all_ports.items():
            if k.lower() == p_lower or v.get("port_id", "").lower() == p_lower:
                return v
            if p_lower in v.get("port_name", "").lower():
                return v

        return None

    def optimize_vessel_choice(
        self,
        cargo_parcel_mt: float,
        origin_port_id: str,
        dest_port_id: str,
        predicted_freight_rates: dict[str, float] | None = None,
        live_fleet: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        """
        Evaluates physical feasibility of all vessel classes and ranks them by total landed cost per tonne.
        """
        origin_port = self._resolve_port(origin_port_id, is_destination=False)
        dest_port = self._resolve_port(dest_port_id, is_destination=True)

        if not origin_port or not dest_port:
            raise ValueError(f"Invalid ports: {origin_port_id} -> {dest_port_id}")

        results = []

        known_classes = set(self.vessels.keys())

        def _class_from_dwt(dwt) -> str | None:
            try:
                d = float(dwt)
            except (TypeError, ValueError):
                return None
            if d >= 200000:
                return "Newcastlemax"
            if d >= 120000:
                return "Capesize"
            if d >= 80000:
                return "Kamsarmax"
            if d >= 65000:
                return "Panamax"
            if d >= 60000:
                return "Ultramax"
            if d >= 50000:
                return "Supramax"
            if d >= 20000:
                return "Handysize"
            return None

        # ── Classify live vessels by vessel class ─────────────────────────────
        from math import radians, cos, sin, asin, sqrt as _sqrt

        def _nm(lat1, lon1, lat2, lon2):
            r = 3440.065
            lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
            a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
            return 2 * asin(_sqrt(a)) * r

        o_coords = origin_port.get("coordinates", {})
        o_lat = o_coords.get("lat", 0.0)
        o_lon = o_coords.get("lon", 0.0)

        classified_live: list[dict[str, Any]] = []
        for vessel in live_fleet or []:
            vclass_name = vessel.get("class") or vessel.get("vessel_class")
            if vclass_name not in known_classes:
                vclass_name = _class_from_dwt(vessel.get("dwt"))
            if vclass_name not in known_classes:
                continue
            classified_live.append({
                **vessel,
                "vessel_class": vclass_name,
                "class": vclass_name,
                "vessel_name": vessel.get("name") or vessel.get("vessel_name"),
                "name": vessel.get("name") or vessel.get("vessel_name"),
            })

        # ── Filter to vessels within 2000 NM of the origin port ───────────────
        # This is the key fix: different ports (Mozambique vs Newcastle) will
        # now produce different vessel lists based on actual geographic proximity.
        BALLAST_RADIUS_NM = 2000
        nearby_live: list[dict[str, Any]] = []
        for v in classified_live:
            try:
                v_lat = float(v.get("lat") or 0)
                v_lon = float(v.get("lon") or 0)
            except (TypeError, ValueError):
                continue
            if not v_lat and not v_lon:
                continue
            if _nm(o_lat, o_lon, v_lat, v_lon) <= BALLAST_RADIUS_NM:
                nearby_live.append(v)

        # Pad with one static vessel per class not covered by nearby live ships,
        # so the result always returns a full class spectrum for comparison.
        covered_classes = {v.get("class") or v.get("vessel_class") for v in nearby_live}
        static_padding = [v for v in self.active_fleet
                          if (v.get("class") or v.get("vessel_class")) not in covered_classes]

        seen_names: set[str] = set()
        fleet_to_evaluate: list[dict[str, Any]] = []
        for v in (nearby_live + static_padding):
            vname = v.get("name") or v.get("vessel_name") or ""
            if vname and vname in seen_names:
                continue
            seen_names.add(vname)
            fleet_to_evaluate.append(v)


        for vessel in fleet_to_evaluate:
            vclass_name = vessel.get("class", vessel.get("vessel_class"))
            v_name = vessel.get("name", vessel.get("vessel_name"))
            v_spec = self.vessels.get(vclass_name)

            
            if not v_spec:
                continue

            capacity = v_spec["typical_capacity_mt"]
            design_draft = v_spec["design_draft_laden_m"]
            loa = v_spec["typical_loa_m"]
            beam = v_spec["typical_beam_m"]

            rejection_reasons = []
            warnings = []

            # 1. Check Origin Port Constraints
            if design_draft > origin_port["max_permissible_draft_m"]:
                rejection_reasons.append(
                    f"Draft {design_draft}m exceeds {origin_port['port_name']} limit ({origin_port['max_permissible_draft_m']}m)"
                )
            if loa > origin_port["max_loa_m"]:
                rejection_reasons.append(
                    f"LOA {loa}m exceeds {origin_port['port_name']} max LOA ({origin_port['max_loa_m']}m)"
                )

            # 2. Check Destination (East Coast India) Constraints
            max_dest_draft = dest_port["max_permissible_draft_m"]
            tide_draft = dest_port.get("max_draft_with_tides_m", max_dest_draft)

            lighterage_cost_per_mt = 0.0

            if dest_port.get("lighterage_required", False):
                lighterage_cost_per_mt = 4.20  # Barge lighterage & transshipment fee at Sagar/Sandheads
                warnings.append(
                    f"Destination {dest_port['port_name']} requires mandatory lighterage at {dest_port.get('lighterage_location', 'Sagar Roads')}."
                )
            elif design_draft > max_dest_draft:
                if design_draft <= tide_draft:
                    warnings.append(
                        f"Draft {design_draft}m exceeds normal berth limit ({max_dest_draft}m). Requires high tide berthing window."
                    )
                else:
                    rejection_reasons.append(
                        f"Draft {design_draft}m exceeds {dest_port['port_name']} maximum draft limit ({max_dest_draft}m)."
                    )

            if loa > dest_port["max_loa_m"]:
                rejection_reasons.append(
                    f"LOA {loa}m exceeds {dest_port['port_name']} max LOA ({dest_port['max_loa_m']}m)."
                )
            if beam > dest_port["max_beam_m"]:
                rejection_reasons.append(
                    f"Beam {beam}m exceeds {dest_port['port_name']} max beam ({dest_port['max_beam_m']}m)."
                )

            # 3. Cargo Volume Fit vs Vessel Class
            # If parcel is much smaller than vessel, partial deadweight penalty
            intake_mt = min(cargo_parcel_mt, capacity)
            deadfreight_penalty = 0.0
            if cargo_parcel_mt < capacity * 0.70:
                deadfreight_penalty = 2.50  # Suboptimal deadweight allocation penalty
                warnings.append(f"Cargo parcel ({cargo_parcel_mt:,.0f} MT) under-utilizes {vclass_name} capacity ({capacity:,.0f} MT).")

            # 4. Landed Cost Calculation ($/tonne)
            # Compute actual route distance via haversine on port coordinates
            from math import radians, cos, sin, asin, sqrt as msqrt
            def _haversine_nm(lat1, lon1, lat2, lon2):
                r = 3440.065
                lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
                a = sin((lat2-lat1)/2)**2 + cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)**2
                return 2 * asin(msqrt(a)) * r

            o_coords = origin_port.get("coordinates", {})
            d_coords = dest_port.get("coordinates", {})
            route_nm = _haversine_nm(
                o_coords.get("lat", 0), o_coords.get("lon", 0),
                d_coords.get("lat", 0), d_coords.get("lon", 0)
            )
            # Reference: Newcastle→Paradip ≈ 5200 NM at $15.50/MT for Kamsarmax
            reference_nm = 5200.0
            base_freight_by_class = {
                "Handysize": 24.50,
                "Supramax": 20.50,
                "Ultramax": 19.00,
                "Panamax": 16.50,
                "Kamsarmax": 15.50,
                "Capesize": 12.80,
                "Newcastlemax": 11.90
            }
            ref_rate = (predicted_freight_rates or {}).get(vclass_name, base_freight_by_class.get(vclass_name, 18.50))
            # Scale linearly by distance ratio vs reference route
            distance_factor = max(0.4, route_nm / reference_nm) if route_nm > 0 else 1.0
            base_freight = ref_rate * distance_factor

            port_charges = (dest_port["port_dues_usd_per_gt"] * capacity * 0.6 + dest_port["pilotage_usd_per_gt"] * 30000) / intake_mt

            
            # Berth turnaround delay factor based on discharge handling rate
            handling_rate_tpd = dest_port["average_output_per_ship_berthday_mt"]
            discharge_days = intake_mt / (handling_rate_tpd + 1e-5)
            demurrage_risk_cost = max(0.0, (discharge_days - 3.0) * 0.35)

            total_landed_cost_per_mt = (
                base_freight +
                port_charges +
                lighterage_cost_per_mt +
                deadfreight_penalty +
                demurrage_risk_cost
            )

            is_feasible = len(rejection_reasons) == 0

            results.append({
                "vessel_name": v_name,
                "operator": vessel.get("operator", "GFW Live"),
                "year_built": vessel.get("year_built", "Unknown"),
                "flag": vessel.get("flag", "Unknown"),
                "vessel_class": vclass_name,
                "is_feasible": is_feasible,
                "intake_capacity_mt": capacity,
                "total_landed_cost_usd_per_mt": round(total_landed_cost_per_mt, 2) if is_feasible else None,
                "base_freight_usd_per_mt": round(base_freight, 2),
                "port_charges_usd_per_mt": round(port_charges, 2),
                "lighterage_cost_usd_per_mt": round(lighterage_cost_per_mt, 2),
                "demurrage_risk_usd_per_mt": round(demurrage_risk_cost, 2),
                "rejection_reasons": rejection_reasons,
                "operational_warnings": warnings,
                "estimated_discharge_days": round(discharge_days, 1)
            })

        # Rank feasible vessels by lowest landed cost per tonne
        feasible_vessels = [r for r in results if r["is_feasible"]]
        feasible_vessels.sort(key=lambda x: x["total_landed_cost_usd_per_mt"])

        best_choice = feasible_vessels[0] if feasible_vessels else None

        return {
            "origin_port": origin_port["port_name"],
            "destination_port": dest_port["port_name"],
            "cargo_parcel_mt": cargo_parcel_mt,
            "recommended_vessel_name": best_choice["vessel_name"] if best_choice else "None Feasible",
            "recommended_vessel_class": best_choice["vessel_class"] if best_choice else None,
            "recommended_total_cost_usd_per_mt": best_choice["total_landed_cost_usd_per_mt"] if best_choice else None,
            "all_vessel_evaluations": results
        }
