import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from sql_percentile_cli import main
from sql_percentile_fixture import sample_percentile_payload


class SqlPercentileCliTest(unittest.TestCase):
    def test_fixture_schema_and_percentile_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "fixture.sqlite"
            output = StringIO()
            with redirect_stdout(output):
                fixture_response = main(["fixture", str(database_path), "--print-payload"])
            self.assertTrue(fixture_response["ok"])
            self.assertTrue(database_path.is_file())
            self.assertEqual(fixture_response["payload"]["table"], "ear_data")

            with redirect_stdout(output):
                schema_response = main(["schema", str(database_path)])
            self.assertTrue(schema_response["ok"])
            self.assertEqual(schema_response["tables"][0]["name"], "ear_data")

            payload_path = Path(directory) / "payload.json"
            payload_path.write_text(
                json.dumps(sample_percentile_payload(database_path), ensure_ascii=False),
                encoding="utf-8",
            )
            with redirect_stdout(output):
                percentile_response = main(["percentile", str(payload_path)])
            self.assertTrue(percentile_response["ok"])
            self.assertEqual(percentile_response["resultCount"], 2)


if __name__ == "__main__":
    unittest.main()
