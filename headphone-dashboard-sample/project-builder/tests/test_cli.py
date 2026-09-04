from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


BUILDER = Path(__file__).resolve().parents[1]


class CliTests(unittest.TestCase):
    def test_headless_json_dry_run(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            csv_path = root / "study.csv"
            photo = root / "photos" / "U1" / "1.jpg"
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b"placeholder")
            csv_path.write_text("用户编号,设备\nU1,A\n", "utf-8")
            environment = dict(os.environ)
            environment["PYTHONPATH"] = str(BUILDER)
            environment["XDG_CACHE_HOME"] = str(root / "cache")
            result = subprocess.run(
                [
                    sys.executable, str(BUILDER / "native_entry.py"), "build",
                    "--update-mode", "new", "--project-name", "CLI研究",
                    "--csv", str(csv_path), "--photos", str(root / "photos"),
                    "--output", str(root / "projects"), "--mapping-mode", "sequence",
                    "--views", "正面", "--dry-run", "--json",
                ],
                env=environment,
                text=True,
                capture_output=True,
                check=True,
            )
            payload = json.loads(result.stdout)
            self.assertEqual(payload["projectName"], "CLI研究")
            self.assertTrue(payload["dryRun"])
            self.assertEqual(payload["issues"], 0)
            self.assertFalse((root / "projects" / "CLI研究").exists())


if __name__ == "__main__":
    unittest.main()
