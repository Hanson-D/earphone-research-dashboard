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
