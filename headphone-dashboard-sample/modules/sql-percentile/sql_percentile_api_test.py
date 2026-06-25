import sqlite3
import tempfile
import unittest
from pathlib import Path

from sql_percentile_fixture import create_fixture_database, sample_percentile_payload
from sql_percentile_api import percentile_response, route_request, schema_response


class SqlPercentileApiTest(unittest.TestCase):
    def make_database(self, directory):
        database_path = Path(directory) / "ear.sqlite"
        with sqlite3.connect(database_path) as connection:
            connection.execute("CREATE TABLE ear_data (ear_side TEXT, concha_width REAL, age INTEGER)")
            connection.executemany(
                "INSERT INTO ear_data VALUES (?, ?, ?)",
                [
                    ("left", 20.0, 22),
                    ("left", 24.0, 30),
                    ("right", 28.0, 35),
                ],
            )
        return database_path

    def test_schema_response(self):
        with tempfile.TemporaryDirectory() as directory:
            response = schema_response(self.make_database(directory))
            self.assertTrue(response["ok"])
            self.assertEqual(response["tables"][0]["name"], "ear_data")

    def test_percentile_response_with_filters(self):
        with tempfile.TemporaryDirectory() as directory:
            response = percentile_response({
                "databasePath": str(self.make_database(directory)),
                "table": "ear_data",
                "cohortFilters": [{"column": "ear_side", "operator": "equals", "value": "left"}],
                "mappings": [{"dashboardField": "concha_width_mm", "dbColumn": "concha_width", "value": 24}],
            })
            self.assertTrue(response["ok"])
            self.assertTrue(response["cohortFiltered"])
            self.assertEqual(response["resultCount"], 1)
            self.assertEqual(response["results"][0]["sampleSize"], 2)

    def test_percentile_response_validates_required_fields(self):
        response = percentile_response({"table": "ear_data", "mappings": []})
        self.assertFalse(response["ok"])
        self.assertEqual(response["status"], 400)
        self.assertIn("databasePath", response["error"])

    def test_route_request(self):
        response = route_request("GET", "/api/unknown")
        self.assertFalse(response["ok"])
        self.assertEqual(response["status"], 404)

    def test_fixture_database_end_to_end(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = create_fixture_database(Path(directory) / "fixture.sqlite")
            schema = schema_response(database_path)
            self.assertTrue(schema["ok"])
            self.assertEqual(schema["tables"][0]["name"], "ear_data")

            response = percentile_response(sample_percentile_payload(database_path))
            self.assertTrue(response["ok"])
            self.assertEqual(response["resultCount"], 2)
            self.assertEqual(response["warningCount"], 0)
            self.assertTrue(all(result["cohortFiltered"] for result in response["results"]))
            self.assertEqual(response["results"][0]["sampleSize"], 3)


if __name__ == "__main__":
    unittest.main()
