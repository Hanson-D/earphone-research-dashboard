import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("dashboard_server", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class ServerProjectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous_root = os.environ.get("DASHBOARD_PROJECTS_ROOT")
        os.environ["DASHBOARD_PROJECTS_ROOT"] = self.tmp.name

    def tearDown(self):
        if self.previous_root is None:
            os.environ.pop("DASHBOARD_PROJECTS_ROOT", None)
        else:
            os.environ["DASHBOARD_PROJECTS_ROOT"] = self.previous_root
        self.tmp.cleanup()

    def test_project_id_rejects_paths(self):
        self.assertTrue(server.is_valid_project_id("study_01-A"))
        self.assertFalse(server.is_valid_project_id("../secret"))
        self.assertFalse(server.is_valid_project_id("study/01"))

    def test_default_port_candidates_start_at_7362(self):
        candidates = list(server.port_candidates())
        self.assertEqual(candidates[0], 7362)
        self.assertEqual(candidates[-1], 7461)
        self.assertEqual(len(candidates), 100)

    def test_default_host_allows_lan_access(self):
        self.assertEqual(server.DEFAULT_HOST, "0.0.0.0")

    def test_photo_upload_relative_paths_are_constrained(self):
        self.assertEqual(server.safe_relative_photo_path("U001/front.jpg").as_posix(), "U001/front.jpg")
        with self.assertRaises(ValueError):
            server.safe_relative_photo_path("../secret.jpg")
        with self.assertRaises(ValueError):
            server.safe_relative_photo_path("U001/readme.txt")

    def test_create_list_and_read_server_project(self):
        result = server.save_server_project(
            "study-01",
            {"version": 1, "rows": [{"user_id": "U001"}]},
            title="研究 01",
            create=True,
        )
        self.assertEqual(result["revision"], 1)

        projects = server.list_server_projects()
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["id"], "study-01")
        self.assertEqual(projects[0]["title"], "研究 01")
        self.assertEqual(projects[0]["rows"], 1)

        _, project, revision = server.read_server_project("study-01")
        self.assertEqual(revision, 1)
        self.assertEqual(project["_server"]["id"], "study-01")

    def test_list_local_project_files_includes_non_id_filenames(self):
        root = Path(self.tmp.name)
        (root / "我的项目.json").write_text(json.dumps({
            "title": "中文项目",
            "rows": [{"user_id": "U001"}, {"user_id": "U002"}],
        }), encoding="utf-8")
        (root / "bad.json").write_text("{bad", encoding="utf-8")

        projects = server.list_local_project_files()
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["title"], "中文项目")
        self.assertEqual(projects[0]["rows"], 2)
        self.assertTrue(projects[0]["path"].endswith("我的项目.json"))

    def test_save_requires_matching_revision(self):
        server.save_server_project("study-01", {"version": 1, "rows": []}, create=True)
        ok = server.save_server_project("study-01", {"version": 1, "rows": []}, expected_revision=1)
        self.assertEqual(ok["revision"], 2)

        conflict = server.save_server_project("study-01", {"version": 1, "rows": []}, expected_revision=1)
        self.assertEqual(conflict["status"], 409)
        self.assertEqual(conflict["currentRevision"], 2)

        stored = json.loads((Path(self.tmp.name) / "study-01.json").read_text(encoding="utf-8"))
        self.assertEqual(stored["_server"]["revision"], 2)

    def test_save_preserves_existing_title_when_not_supplied(self):
        server.save_server_project("study-01", {"version": 1, "rows": []}, title="标题 A", create=True)
        ok = server.save_server_project("study-01", {"version": 1, "rows": []}, expected_revision=1)
        self.assertEqual(ok["project"]["_server"]["title"], "标题 A")


if __name__ == "__main__":
    unittest.main()
