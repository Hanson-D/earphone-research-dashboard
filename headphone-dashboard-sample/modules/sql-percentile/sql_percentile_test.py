import sqlite3
import tempfile
import unittest
from pathlib import Path

from sql_percentile import (
    build_filter_where,
    compute_percentile_analysis,
    compute_percentiles,
    read_schema,
    summarize_distribution,
)


class SqlPercentileTest(unittest.TestCase):
    def test_schema_and_percentiles(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "ear.sqlite"
            with sqlite3.connect(database_path) as connection:
                connection.execute("CREATE TABLE ear_data (name TEXT, concha_width REAL, age INTEGER, ear_side TEXT)")
                connection.executemany(
                    "INSERT INTO ear_data VALUES (?, ?, ?, ?)",
                    [("A", 20.0, 20, "left"), ("B", 24.0, 30, "left"), ("C", 28.0, 40, "right")],
                )

            schema = read_schema(database_path)
            self.assertEqual(schema[0]["name"], "ear_data")
            self.assertTrue(next(column for column in schema[0]["columns"] if column["name"] == "concha_width")["numeric"])

            results = compute_percentiles(database_path, "ear_data", [
                {"dashboardField": "concha_width_mm", "dbColumn": "concha_width", "value": 24.0},
            ])
            self.assertEqual(results[0]["sampleSize"], 3)
            self.assertAlmostEqual(results[0]["percentile"], 2 / 3 * 100)
            self.assertEqual(results[0]["rank"], 2)
            self.assertEqual(results[0]["belowCount"], 1)
            self.assertEqual(results[0]["equalCount"], 1)
            self.assertAlmostEqual(results[0]["mean"], 24.0)
            self.assertAlmostEqual(results[0]["sd"], 3.265986323710904)

            filtered_results = compute_percentiles(
                database_path,
                "ear_data",
                [{"dashboardField": "concha_width_mm", "dbColumn": "concha_width", "value": 24.0}],
                [{"column": "ear_side", "operator": "equals", "value": "left"}],
            )
            self.assertTrue(filtered_results[0]["cohortFiltered"])
            self.assertEqual(filtered_results[0]["sampleSize"], 2)
            self.assertAlmostEqual(filtered_results[0]["percentile"], 100.0)

            analysis = compute_percentile_analysis(
                database_path,
                "ear_data",
                [
                    {"dashboardField": "concha_width_mm", "dbColumn": "concha_width", "value": 24.0},
                    {"dashboardField": "bad", "dbColumn": "missing_column", "value": 1},
                ],
            )
            self.assertEqual(analysis["resultCount"], 1)
            self.assertEqual(analysis["warningCount"], 1)
            self.assertIn("字段不存在", analysis["warnings"][0]["message"])

    def test_distribution_summary(self):
        summary = summarize_distribution([10, 20, 20, 40], 20)
        self.assertEqual(summary["sampleSize"], 4)
        self.assertEqual(summary["rank"], 3)
        self.assertEqual(summary["belowCount"], 1)
        self.assertEqual(summary["equalCount"], 2)
        self.assertAlmostEqual(summary["percentile"], 75.0)
        self.assertAlmostEqual(summary["mean"], 22.5)
        self.assertIsNotNone(summary["zScore"])

    def test_build_filter_where_rejects_unknown_columns(self):
        with self.assertRaises(ValueError):
            build_filter_where(
                [{"column": "unsafe", "operator": "equals", "value": "x"}],
                {"ear_side"},
            )


if __name__ == "__main__":
    unittest.main()
