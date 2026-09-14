from typing import List, Dict, Any, Optional
from .schemas import TelemetryReadingInput, EquipmentInput

# Default baseline values by equipment type
BASELINES: Dict[str, Dict[str, float]] = {
    "MRI Scanner": {"temperature": 45.0, "vibration": 1.5, "powerKw": 14.0, "pressure": 4.5, "voltage": 400.0},
    "CT Scanner": {"temperature": 48.0, "vibration": 2.0, "powerKw": 18.0, "pressure": 3.0, "voltage": 380.0},
    "Ventilator": {"temperature": 37.0, "vibration": 0.8, "powerKw": 0.5, "pressure": 20.0, "voltage": 220.0},
    "Patient Monitor": {"temperature": 36.5, "vibration": 0.3, "powerKw": 0.2, "pressure": 1.0, "voltage": 120.0},
    "Defibrillator": {"temperature": 35.0, "vibration": 0.4, "powerKw": 0.4, "pressure": 1.0, "voltage": 120.0},
    "Anesthesia Machine": {"temperature": 38.0, "vibration": 0.9, "powerKw": 1.2, "pressure": 15.0, "voltage": 220.0},
    "Dialysis Machine": {"temperature": 37.5, "vibration": 1.1, "powerKw": 1.8, "pressure": 2.5, "voltage": 220.0},
    "Infusion Pump": {"temperature": 36.0, "vibration": 0.5, "powerKw": 0.1, "pressure": 0.5, "voltage": 120.0},
}

DEFAULT_BASELINE = {"temperature": 40.0, "vibration": 1.0, "powerKw": 5.0, "pressure": 2.0, "voltage": 220.0}

def get_equipment_baseline(equipment_type: str) -> Dict[str, float]:
    for key, val in BASELINES.items():
        if key.lower() in equipment_type.lower():
            return val
    return DEFAULT_BASELINE

def preprocess_readings(
    equipment: EquipmentInput,
    telemetry: Optional[List[TelemetryReadingInput]] = None,
    manual: Optional[TelemetryReadingInput] = None
) -> List[Dict[str, Any]]:
    """
    Combines, imputes, and normalizes telemetry readings for feature extraction.
    """
    baseline = get_equipment_baseline(equipment.equipmentType)
    readings: List[Dict[str, Any]] = []

    if manual:
        readings.append({
            "timestamp": manual.timestamp,
            "temperature": manual.temperature if manual.temperature is not None else baseline["temperature"],
            "vibration": manual.vibration if manual.vibration is not None else baseline["vibration"],
            "powerKw": manual.powerKw if manual.powerKw is not None else baseline["powerKw"],
            "pressure": manual.pressure if manual.pressure is not None else baseline["pressure"],
            "voltage": manual.voltage if manual.voltage is not None else baseline["voltage"],
            "operatingHours": manual.operatingHours if manual.operatingHours is not None else (equipment.operatingHours or 100.0),
            "errorCount": manual.errorCount if manual.errorCount is not None else 0,
        })
    elif telemetry and len(telemetry) > 0:
        for t in telemetry:
            readings.append({
                "timestamp": t.timestamp,
                "temperature": t.temperature if t.temperature is not None else baseline["temperature"],
                "vibration": t.vibration if t.vibration is not None else baseline["vibration"],
                "powerKw": t.powerKw if t.powerKw is not None else baseline["powerKw"],
                "pressure": t.pressure if t.pressure is not None else baseline["pressure"],
                "voltage": t.voltage if t.voltage is not None else baseline["voltage"],
                "operatingHours": t.operatingHours if t.operatingHours is not None else (equipment.operatingHours or 100.0),
                "errorCount": t.errorCount if t.errorCount is not None else 0,
            })
    else:
        # Fallback to single reading based on equipment object
        readings.append({
            "timestamp": None,
            "temperature": baseline["temperature"],
            "vibration": baseline["vibration"],
            "powerKw": baseline["powerKw"],
            "pressure": baseline["pressure"],
            "voltage": baseline["voltage"],
            "operatingHours": equipment.operatingHours or 100.0,
            "errorCount": 0,
        })

    return readings
