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
        server.ALLOWED_ROOTS.clear()
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

    def test_project_photo_root_must_be_relative(self):
        self.assertEqual(server.safe_relative_root("photos").as_posix(), "photos")
        self.assertEqual(server.safe_relative_root("").as_posix(), "photos")
        with self.assertRaises(ValueError):
            server.safe_relative_root("../photos")
        with self.assertRaises(ValueError):
            server.safe_relative_root("/tmp/photos")

    def test_project_photo_root_can_be_resolved_from_project_directory(self):
        project = server.resolve_client_path("projects/研究A/研究A.json")
        root = (project.parent / server.safe_relative_root("photos")).as_posix()
        self.assertTrue(root.endswith("projects/研究A/photos"))

    def test_bare_ear_library_saves_allowed_photos(self):
        root = Path(self.tmp.name)
        source_root = root / "photos"
        source_root.mkdir()
        photo = source_root / "bare.jpg"
        photo.write_bytes(b"image")
        server.ALLOWED_ROOTS.add(source_root.resolve())

        result = server.save_bare_ear_library_photos([{
            "user": "张三",
            "field": "bare_ear_photo_左耳",
            "source": str(photo),
        }])

        self.assertEqual(len(result["saved"]), 1)
        self.assertEqual(result["saved"][0]["user"], "张三")
        self.assertEqual(result["saved"][0]["field"], "bare_ear_photo_左耳")
        self.assertEqual(len(server.bare_ear_library_index()), 1)

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

    def test_list_local_project_files_recurses_project_folders(self):
        root = Path(self.tmp.name)
        project_dir = root / "项目A"
        project_dir.mkdir()
        (project_dir / "项目A.json").write_text(json.dumps({
            "title": "项目A",
            "rows": [{"user_id": "U001"}],
        }), encoding="utf-8")
        exports_dir = project_dir / "exports"
        exports_dir.mkdir()
        (exports_dir / "误导出.json").write_text(json.dumps({"title": "不应加载"}), encoding="utf-8")

        projects = server.list_local_project_files()
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["title"], "项目A")
        self.assertTrue(projects[0]["path"].endswith("项目A/项目A.json"))

    def test_list_local_project_files_creates_missing_projects_root(self):
        root = Path(self.tmp.name) / "missing-projects"
        os.environ["DASHBOARD_PROJECTS_ROOT"] = str(root)

        projects = server.list_local_project_files()
        self.assertEqual(projects, [])
        self.assertTrue(root.is_dir())

    def test_local_project_files_use_relative_paths_inside_app_root(self):
        with tempfile.TemporaryDirectory(dir=server.app_root()) as local_root:
            previous_root = os.environ.get("DASHBOARD_PROJECTS_ROOT")
            os.environ["DASHBOARD_PROJECTS_ROOT"] = local_root
            try:
                project_path = Path(local_root) / "相对项目.json"
                project_path.write_text(json.dumps({
                    "title": "相对项目",
                    "rows": [{"user_id": "U001"}],
                }), encoding="utf-8")

                projects = server.list_local_project_files()
            finally:
                if previous_root is None:
                    os.environ.pop("DASHBOARD_PROJECTS_ROOT", None)
                else:
                    os.environ["DASHBOARD_PROJECTS_ROOT"] = previous_root

        self.assertEqual(projects[0]["path"], project_path.relative_to(server.app_root()).as_posix())
        self.assertNotIn(str(server.app_root()), projects[0]["path"])

    def test_project_csv_export_is_written_to_project_exports_folder(self):
        project_dir = Path(self.tmp.name) / "项目A"
        project_dir.mkdir()
        project_path = project_dir / "项目A.json"
        project_path.write_text("{}", encoding="utf-8")

        result = server.save_project_csv_export(str(project_path), "user_id\nU001", "项目A")
        export_path = Path(result["path"])
        if not export_path.is_absolute():
            export_path = server.app_root() / export_path

        self.assertEqual(export_path.parent.name, "exports")
        self.assertTrue(export_path.name.startswith("项目A_"))
        self.assertTrue(export_path.read_text(encoding="utf-8").startswith("\ufeffuser_id"))

    def test_project_asset_csv_is_written_to_project_data_folder(self):
        project_dir = Path(self.tmp.name) / "项目A"
        project_path = project_dir / "项目A.json"

        result = server.save_project_asset_file(str(project_path), "csv", "source.csv", b"user_id\nU001")
        target = project_dir / result["path"]

        self.assertEqual(result["path"], "data/source.csv")
        self.assertEqual(target.read_bytes(), b"user_id\nU001")

    def test_project_asset_photo_is_written_to_project_photos_folder(self):
        project_dir = Path(self.tmp.name) / "项目A"
        project_path = project_dir / "项目A.json"

        result = server.save_project_asset_file(str(project_path), "photo", "U001/front.jpg", b"image")
        target = project_dir / result["path"]

        self.assertEqual(result["path"], "photos/U001/front.jpg")
        self.assertEqual(target.read_bytes(), b"image")

    def test_copy_project_photos_from_scanned_root(self):
        source_root = Path(self.tmp.name) / "source"
        source_root.mkdir()
        (source_root / "U001").mkdir()
        (source_root / "U001" / "front.jpg").write_bytes(b"image")
        server.ALLOWED_ROOTS.add(source_root.resolve())
        project_path = Path(self.tmp.name) / "项目A" / "项目A.json"

        result = server.copy_project_photos_from_root(str(project_path), str(source_root))

        self.assertEqual(result["copied"], 1)
        self.assertEqual((project_path.parent / "photos" / "U001" / "front.jpg").read_bytes(), b"image")

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
