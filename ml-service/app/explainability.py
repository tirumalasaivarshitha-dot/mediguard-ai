from typing import Dict, List, Tuple
from .schemas import FeatureContributionItem

def generate_explainability(features: Dict[str, float], failure_risk: float) -> Tuple[List[str], List[FeatureContributionItem]]:
    explanations: List[str] = []
    contributions: List[FeatureContributionItem] = []

    # Calculate proportional contributions
    t_raw = features["temp_baseline_dev"] * 6.0
    v_raw = features["vib_baseline_dev"] * 15.0
    e_raw = features["error_count"] * 3.5
    h_raw = (features["operating_hours"] / 10000.0) * 10.0
    m_raw = (features["days_since_maintenance"] / 180.0) * 10.0

    sum_raw = t_raw + v_raw + e_raw + h_raw + m_raw + 0.001

    t_contrib = min(100.0, max(0.0, (t_raw / sum_raw) * failure_risk))
    v_contrib = min(100.0, max(0.0, (v_raw / sum_raw) * failure_risk))
    e_contrib = min(100.0, max(0.0, (e_raw / sum_raw) * failure_risk))
    h_contrib = min(100.0, max(0.0, (h_raw / sum_raw) * failure_risk))
    m_contrib = min(100.0, max(0.0, (m_raw / sum_raw) * failure_risk))

    if features["temp_baseline_dev"] > 2.0:
        explanations.append(f"Operating temperature is elevated ({features['temp_current']}°C, +{round(features['temp_baseline_dev'], 1)}°C above baseline).")
        contributions.append(FeatureContributionItem(
            feature="Thermal Elevation",
            contribution=round(t_contrib, 1),
            summary=f"Temperature elevated above baseline by {round(features['temp_baseline_dev'], 1)}°C"
        ))

    if features["vib_baseline_dev"] > 0.5:
        explanations.append(f"Vibration level is abnormal ({features['vib_current']} mm/s, +{round(features['vib_baseline_dev'], 1)} mm/s deviation).")
        contributions.append(FeatureContributionItem(
            feature="Mechanical Vibration",
            contribution=round(v_contrib, 1),
            summary=f"Vibration amplitude deviates by {round(features['vib_baseline_dev'], 1)} mm/s"
        ))

    if features["error_count"] > 2:
        explanations.append(f"System logged {int(features['error_count'])} errors in recent operation cycles.")
        contributions.append(FeatureContributionItem(
            feature="Error Frequency",
            contribution=round(e_contrib, 1),
            summary=f"{int(features['error_count'])} logged system errors"
        ))

    if features["days_since_maintenance"] > 60:
        explanations.append(f"Maintenance interval extended ({int(features['days_since_maintenance'])} days since last servicing).")
        contributions.append(FeatureContributionItem(
            feature="Maintenance Delay",
            contribution=round(m_contrib, 1),
            summary=f"{int(features['days_since_maintenance'])} days since last maintenance"
        ))

    if features["operating_hours"] > 5000:
        explanations.append(f"High cumulative component usage ({int(features['operating_hours'])} total operating hours).")
        contributions.append(FeatureContributionItem(
            feature="Component Exposure",
            contribution=round(h_contrib, 1),
            summary=f"{int(features['operating_hours'])} total operating hours"
        ))

    if not explanations:
        explanations.append("All monitored telemetry metrics are within expected operating ranges.")
        contributions.append(FeatureContributionItem(
            feature="Baseline Operation",
            contribution=0.0,
            summary="System operating normally within baseline thresholds"
        ))

    return explanations, contributions
