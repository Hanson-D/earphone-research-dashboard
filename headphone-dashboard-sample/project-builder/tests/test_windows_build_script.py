from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WindowsBuildScriptTests(unittest.TestCase):
    def test_build_uses_fresh_short_environment_and_plain_failure_exit(self) -> None:
        script = (ROOT / "build-windows-exe.ps1").read_text("utf-8-sig")
        self.assertIn('("EPB-py311-x64-{0}" -f $PID)', script)
        self.assertIn('Get-Process -Name "EarphoneProjectBuilder"', script)
        self.assertIn('"-m", "pip", "check"', script)
        self.assertIn("exit 1", script)
        self.assertNotIn("throw $failure", script)


if __name__ == "__main__":
    unittest.main()
