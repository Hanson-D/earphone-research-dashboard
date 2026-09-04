import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from admin_core import (  # noqa: E402
    OPERATIONS,
    build_upload_archive,
    discover_app_root,
    excluded_upload_path,
    remote_script_command,
    save_settings,
    prepare_simple_client_package,
)


class AdminCoreTests(unittest.TestCase):
    def test_operation_keys_are_unique_and_cover_recovery_download(self):
        keys = [operation.key for operation in OPERATIONS]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertIn("client-download", keys)
        self.assertIn("project-relink", keys)

    def test_settings_never_persist_password(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "settings.json"
            save_settings({"host": "10.0.0.8", "password": "secret"}, target)
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(payload["host"], "10.0.0.8")
            self.assertNotIn("password", payload)

    def test_remote_command_quotes_app_root(self):
        command = remote_script_command("/opt/dashboard app", "40-service-control.sh status")
        self.assertEqual(command, "bash '/opt/dashboard app/deployment/linux/root/40-service-control.sh' status")

    def test_upload_exclusions(self):
        for path in (
            "projects/private/project.json",
            ".git/config",
            "deployment/windows-admin-gui/.build-venv/file",
            "deployment/windows-admin-gui/dist/tool.exe",
            "server/__pycache__/server.pyc",
        ):
            self.assertTrue(excluded_upload_path(path), path)
        self.assertFalse(excluded_upload_path("server/server.py"))

    def test_build_archive_excludes_private_and_generated_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "app"
            (root / "server").mkdir(parents=True)
            (root / "server" / "server.py").write_text("print('ok')\n", encoding="utf-8")
            (root / "deployment" / "linux" / "root").mkdir(parents=True)
            (root / "deployment" / "linux" / "root" / "script.sh").write_text("true\n", encoding="utf-8")
            (root / "projects" / "private").mkdir(parents=True)
            (root / "projects" / "private" / "project.json").write_text("{}\n", encoding="utf-8")
            archive_path = Path(temp_dir) / "upload.tar"

            result = build_upload_archive(root, archive_path)

            self.assertEqual(result["files"], 2)
            with tarfile.open(str(archive_path), "r") as archive:
                self.assertEqual(
                    sorted(archive.getnames()),
                    ["deployment/linux/root/script.sh", "server/server.py"],
                )

    def test_discovers_application_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "app"
            nested = root / "deployment" / "windows-admin-gui"
            nested.mkdir(parents=True)
            (root / "server").mkdir()
            (root / "server" / "server.py").touch()
            (root / "deployment" / "linux" / "root").mkdir(parents=True)
            self.assertEqual(discover_app_root(nested), root.resolve())

    def test_prepares_simple_client_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "client"
            root.mkdir()
            (root / "client.bundle").write_text(
                json.dumps({"version": 1, "clientId": "win1"}), encoding="utf-8"
            )
            (root / "install-client.bat").write_text("legacy", encoding="ascii")
            (root / "key").mkdir()
            (root / "key" / "private").write_text("secret", encoding="ascii")
            launcher = Path(temp_dir) / "OpenKanban.exe"
            launcher.write_bytes(b"MZ launcher")

            client_id = prepare_simple_client_package(root, launcher)

            self.assertEqual(client_id, "win1")
            self.assertEqual(
                sorted(path.name for path in root.iterdir()),
                ["OpenKanban.exe", "README.txt", "client.bundle"],
            )
            self.assertEqual((root / "OpenKanban.exe").read_bytes(), b"MZ launcher")


if __name__ == "__main__":
    unittest.main()
