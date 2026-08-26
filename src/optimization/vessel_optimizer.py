"""
Vessel Type & Port Constraint Optimization Engine (Module B).
Evaluates port draft, LOA, beam, and cargo handling constraints across Indian East Coast
and international load ports to determine feasible vessels and compute total landed logistics cost.
"""

import json
from typing import Dict, Any, List, Optional


class VesselConstraintOptimizer:
    """Solves vessel class compatibility and computes full landed chartering costs."""

    def __init__(
        self,
        ports_path: str = "data/reference/ports_master.json",
        vessels_path: str = "data/reference/vessels_master.json",
        routes_path: str = "data/reference/routes_master.json"
    ):
        with open(ports_path, "r") as f:
            pdata = json.load(f)
            self.indian_ports = pdata["indian_east_coast_ports"]
            self.global_ports = pdata["global_load_ports"]

        with open(vessels_path, "r") as f:
            v_data = json.load(f)
            self.vessels = v_data["vessel_classes"]
            self.active_fleet = v_data.get("active_fleet", [])

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

    def optimize_vessel_choice(
        self,
        cargo_parcel_mt: float,
        origin_port_id: str,
        dest_port_id: str,
        predicted_freight_rates: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Evaluates physical feasibility of all vessel classes and ranks them by total landed cost per tonne.
        """
        norm_origin = self.PORT_ALIASES.get(origin_port_id.lower(), origin_port_id.upper())
        norm_dest = self.PORT_ALIASES.get(dest_port_id.lower(), dest_port_id.upper())

        origin_port = self.global_ports.get(norm_origin) or self.indian_ports.get(norm_origin)
        dest_port = self.indian_ports.get(norm_dest) or self.global_ports.get(norm_dest)

        if not origin_port or not dest_port:
            raise ValueError(f"Invalid ports: {origin_port_id} ({norm_origin}) -> {dest_port_id} ({norm_dest})")

        results = []

        for vessel in self.active_fleet:
            vclass_name = vessel["vessel_class"]
            v_name = vessel["vessel_name"]
            v_spec = self.vessels.get(vclass_name)
            
            if not v_spec:
                continue

            capacity = v_spec["typical_capacity_mt"]
            design_draft = v_spec["design_draft_laden_m"]
            loa = v_spec["typical_loa_m"]
            beam = v_spec["typical_beam_m"]
            is_geared = v_spec["geared"]

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

            lighterage_needed = False
            lighterage_cost_per_mt = 0.0

            if dest_port.get("lighterage_required", False):
                lighterage_needed = True
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
            default_freight_by_class = {
                "Handysize": 24.50,
                "Supramax": 20.50,
                "Ultramax": 19.00,
                "Panamax": 16.50,
                "Kamsarmax": 15.50,
                "Capesize": 12.80,
                "Newcastlemax": 11.90
            }
            base_freight = (predicted_freight_rates or {}).get(vclass_name, default_freight_by_class.get(vclass_name, 18.50))
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
                "operator": vessel.get("operator"),
                "year_built": vessel.get("year_built"),
                "flag": vessel.get("flag"),
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
