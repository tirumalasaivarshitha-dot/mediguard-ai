import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.main import predict_dataset, train_dataset


class DatasetTrainingTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {
                "Machine_ID": f"M-{index % 4}",
                "Timestamp": f"2025-01-{(index % 28) + 1:02d}",
                "Temperature": 35 + index % 8,
                "Pressure": 2 + index % 3,
                "Vibration_Level": 0.2 + (index % 6) / 10,
                "Humidity": 40 + index % 10,
                "Power_Consumption": 10 + index % 5,
                "Failure_Status": "failure" if index % 3 == 0 else "normal",
            }
            for index in range(40)
        ]

    def test_machine_failure_dataset_trains_and_predicts(self):
        result = train_dataset({
            "rows": self.rows,
            "targetColumn": "Failure_Status",
            "algorithm": "Auto",
            "datasetId": "test-dataset",
            "datasetName": "machine_failure_data.csv",
        })
        artifact = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", result["artifactPath"].replace("/", os.sep))
        try:
            self.assertEqual(result["originalFeatures"], [
                "Temperature", "Pressure", "Vibration_Level", "Humidity", "Power_Consumption"
            ])
            prediction = predict_dataset({
                "artifactPath": result["artifactPath"],
                "rows": self.rows[:2],
                "targetColumn": "Failure_Status",
                "positiveClass": 1,
            })
            self.assertIsNotNone(prediction["results"][0]["failureRisk"])
            self.assertEqual(prediction["results"][0]["predictionStatus"], "SUPERVISED")
        finally:
            if os.path.exists(artifact):
                os.remove(artifact)

    def test_unrecognized_target_is_rejected(self):
        rows = [{**row, "Outcome": "alpha" if index % 2 else "beta"} for index, row in enumerate(self.rows)]
        with self.assertRaises(Exception):
            train_dataset({"rows": rows, "targetColumn": "Outcome"})

    def test_different_feature_names_are_supported(self):
        rows = [
            {
                "Asset": f"A-{index % 3}",
                "ObservedAt": f"2025-02-{(index % 20) + 1:02d}",
                "Temp_C": 30 + index % 6,
                "Load": 10 + index % 4,
                "Condition": "failed" if index % 2 else "operational",
            }
            for index in range(24)
        ]
        result = train_dataset({"rows": rows, "targetColumn": "Condition"})
        artifact = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", result["artifactPath"].replace("/", os.sep))
        try:
            self.assertEqual(result["originalFeatures"], ["Temp_C", "Load"])
        finally:
            if os.path.exists(artifact):
                os.remove(artifact)

    def test_missing_failure_target_is_not_fabricated(self):
        rows = [{key: value for key, value in row.items() if key != "Failure_Status"} for row in self.rows]
        with self.assertRaises(Exception):
            train_dataset({"rows": rows, "targetColumn": "Failure_Status"})


if __name__ == "__main__":
    unittest.main()
