import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("make-client-bundle.py")


class MakeClientBundleTests(unittest.TestCase):
    def run_builder(self, root, include_key=True):
        known_hosts = root / "known_hosts"
        known_hosts.write_text("10.0.0.8 ssh-ed25519 AAAA\n", encoding="utf-8")
        private_key = root / "kanban_win1"
        private_key.write_text("PRIVATE KEY\n", encoding="utf-8")
        output = root / "client.bundle"
        command = [
            sys.executable, str(SCRIPT),
            "--output", str(output),
            "--client-id", "win1",
            "--ssh-user", "kanban_win1",
            "--server-host", "10.0.0.8",
            "--ssh-port", "22",
            "--local-port", "17361",
            "--remote-port", "17361",
            "--key-name", "kanban_win1",
            "--access-token", "a" * 43,
            "--known-hosts", str(known_hosts),
        ]
        if include_key:
            command.extend(["--private-key", str(private_key)])
        subprocess.run(command, check=True)
        return json.loads(output.read_text(encoding="utf-8"))

    def test_creates_full_portable_bundle(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            payload = self.run_builder(Path(temp_dir))
        self.assertEqual(payload["clientId"], "win1")
        self.assertEqual(payload["remotePort"], 17361)
        self.assertEqual(base64.b64decode(payload["privateKey"]), b"PRIVATE KEY\n")

    def test_creates_migration_bundle_without_private_key(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            payload = self.run_builder(Path(temp_dir), include_key=False)
        self.assertNotIn("privateKey", payload)
        self.assertIn("knownHosts", payload)


if __name__ == "__main__":
    unittest.main()
