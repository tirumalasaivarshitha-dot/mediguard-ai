import numpy as np
import pandas as pd
from typing import List, Dict, Any
from .schemas import EquipmentInput
from .preprocessing import get_equipment_baseline

FEATURE_NAMES = [
    "temp_current",
    "temp_baseline_dev",
    "vib_current",
    "vib_baseline_dev",
    "power_current",
    "power_baseline_dev",
    "operating_hours",
    "error_count",
    "days_since_maintenance",
    "temp_trend",
    "vib_trend",
]

def extract_feature_vector(equipment: EquipmentInput, processed_readings: List[Dict[str, Any]]) -> Dict[str, float]:
    df = pd.DataFrame(processed_readings)
    baseline = get_equipment_baseline(equipment.equipmentType)

    # Current (latest) values
    latest = df.iloc[-1]
    temp_curr = float(latest.get("temperature", baseline["temperature"]))
    vib_curr = float(latest.get("vibration", baseline["vibration"]))
    power_curr = float(latest.get("powerKw", baseline["powerKw"]))
    op_hours = float(latest.get("operatingHours", equipment.operatingHours or 100.0))
    err_count = float(latest.get("errorCount", 0))
    days_maint = float(equipment.lastMaintenanceDaysAgo if equipment.lastMaintenanceDaysAgo is not None else 30)

    # Deviations from baseline
    temp_dev = max(0.0, temp_curr - baseline["temperature"])
    vib_dev = max(0.0, vib_curr - baseline["vibration"])
    power_dev = abs(power_curr - baseline["powerKw"])

    # Trend calculations (slope if multiple readings available)
    if len(df) > 1:
        temp_series = df["temperature"].values
        vib_series = df["vibration"].values
        temp_trend = float(temp_series[-1] - temp_series[0])
        vib_trend = float(vib_series[-1] - vib_series[0])
    else:
        temp_trend = 0.0
        vib_trend = 0.0

    return {
        "temp_current": temp_curr,
        "temp_baseline_dev": temp_dev,
        "vib_current": vib_curr,
        "vib_baseline_dev": vib_dev,
        "power_current": power_curr,
        "power_baseline_dev": power_dev,
        "operating_hours": op_hours,
        "error_count": err_count,
        "days_since_maintenance": days_maint,
        "temp_trend": temp_trend,
        "vib_trend": vib_trend,
    }

def feature_dict_to_array(feature_dict: Dict[str, float]) -> np.ndarray:
    return np.array([[feature_dict[name] for name in FEATURE_NAMES]])
