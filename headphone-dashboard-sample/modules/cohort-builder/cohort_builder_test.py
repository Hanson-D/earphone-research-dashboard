import sqlite3
import tempfile
import unittest
from pathlib import Path

from cohort_builder import build_where, count_cohort


class CohortBuilderTest(unittest.TestCase):
    def test_build_where_with_parameter_binding(self):
        where_sql, params = build_where(
            [
                {"column": "ear_side", "operator": "equals", "value": "left"},
                {"column": "age", "operator": "between", "value": [40, 20]},
                {"column": "sex", "operator": "in", "value": ["female", "male"]},
            ],
            {"ear_side", "age", "sex"},
        )
        self.assertEqual(
            where_sql,
            '"ear_side" = ? AND "age" BETWEEN ? AND ? AND "sex" IN (?, ?)',
        )
        self.assertEqual(params, ["left", 20, 40, "female", "male"])

    def test_rejects_unknown_columns(self):
        with self.assertRaises(ValueError):
            build_where(
                [{"column": "name; DROP TABLE ear_data", "operator": "equals", "value": "x"}],
                {"name"},
            )

    def test_count_cohort(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "ear.sqlite"
            with sqlite3.connect(database_path) as connection:
                connection.execute("CREATE TABLE ear_data (ear_side TEXT, age INTEGER, sex TEXT)")
                connection.executemany(
                    "INSERT INTO ear_data VALUES (?, ?, ?)",
                    [
                        ("left", 22, "female"),
                        ("left", 45, "female"),
                        ("right", 24, "male"),
                    ],
                )
            count = count_cohort(
                database_path,
                "ear_data",
                [
                    {"column": "ear_side", "operator": "equals", "value": "left"},
                    {"column": "age", "operator": "between", "value": [18, 30]},
                ],
                {"ear_side", "age", "sex"},
            )
            self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
