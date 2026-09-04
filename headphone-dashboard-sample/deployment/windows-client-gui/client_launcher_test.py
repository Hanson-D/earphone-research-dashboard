import base64
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

import client_launcher as launcher  # noqa: E402


def encoded(value):
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def valid_bundle():
    return {
        "version": 1,
        "clientId": "win1",
        "sshUser": "kanban_win1",
        "serverHost": "10.0.0.8",
        "sshPort": 22,
        "localPort": 17361,
        "remotePort": 17361,
        "keyName": "kanban_win1",
        "accessToken": "a" * 43,
        "knownHosts": encoded("10.0.0.8 ssh-ed25519 AAAA\n"),
        "privateKey": encoded("PRIVATE KEY\n"),
    }


class ClientLauncherTests(unittest.TestCase):
    def test_validates_and_loads_bundle(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "client.bundle"
            path.write_text(json.dumps(valid_bundle()), encoding="utf-8")
            payload = launcher.load_bundle(path)
        self.assertEqual(payload["clientId"], "win1")
        self.assertEqual(payload["remotePort"], 17361)

    def test_rejects_invalid_token_and_port(self):
        payload = valid_bundle()
        payload["accessToken"] = "short"
        with self.assertRaises(launcher.ClientError):
            launcher.validate_bundle(payload)

    def test_rejects_key_path_or_identity_not_bound_to_client_id(self):
        payload = valid_bundle()
        payload["keyName"] = r"..\other-key"
        with self.assertRaises(launcher.ClientError):
            launcher.validate_bundle(payload)
        payload = valid_bundle()
        payload["sshUser"] = "kanban_win2"
        with self.assertRaises(launcher.ClientError):
            launcher.validate_bundle(payload)
        payload = valid_bundle()
        payload["localPort"] = 70000
        with self.assertRaises(launcher.ClientError):
            launcher.validate_bundle(payload)

    def test_dashboard_url_contains_local_port_and_encoded_token(self):
        url = launcher.dashboard_url(valid_bundle())
        self.assertTrue(url.startswith("http://127.0.0.1:17361/"))
        self.assertIn("access_token=", url)

    def test_state_root_is_scoped_to_windows_user(self):
        previous = os.environ.get("LOCALAPPDATA")
        try:
            os.environ["LOCALAPPDATA"] = r"C:\Users\win1\AppData\Local"
            self.assertEqual(
                launcher.state_root("win1"),
                Path(r"C:\Users\win1\AppData\Local") / "EarphoneDashboardTunnel" / "win1",
            )
        finally:
            if previous is None:
                os.environ.pop("LOCALAPPDATA", None)
            else:
                os.environ["LOCALAPPDATA"] = previous


if __name__ == "__main__":
    unittest.main()
