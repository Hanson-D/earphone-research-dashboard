import importlib.util
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
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

    def test_relative_projects_root_is_under_app_root(self):
        os.environ["DASHBOARD_PROJECTS_ROOT"] = "projects"

        root = server.project_root()

        self.assertEqual(root, (server.app_root() / "projects").resolve())

    def test_default_project_scan_roots_include_sibling_projects(self):
        os.environ.pop("DASHBOARD_PROJECTS_ROOT", None)

        roots = server.project_scan_roots()

        self.assertIn((server.app_root() / "projects").resolve(), roots)
        self.assertIn((server.app_root().parent / "projects").resolve(), roots)
        self.assertIn((server.app_root().parent.parent / "projects").resolve(), roots)

    def test_local_project_scan_root_info_reports_paths(self):
        os.environ["DASHBOARD_PROJECTS_ROOT"] = self.tmp.name

        roots = server.list_local_project_scan_root_info()

        self.assertEqual(len(roots), 1)
        self.assertIn("path", roots[0])
        self.assertTrue(roots[0]["exists"])

    def test_photo_scan_uses_cache_for_unchanged_root(self):
        root = Path(self.tmp.name) / "photos"
        (root / "U001").mkdir(parents=True)
        (root / "U001" / "front.jpg").write_bytes(b"image")

        first, first_cached = server.scan_photo_root(root)
        second, second_cached = server.scan_photo_root(root)

        self.assertFalse(first_cached)
        self.assertTrue(second_cached)
        self.assertEqual(first, second)
        self.assertTrue(server.photo_scan_cache_path(root).is_file())

    def test_photo_thumbnail_cache_is_under_projects_cache(self):
        root = Path(self.tmp.name) / "photos"
        root.mkdir()
        photo = root / "front.jpg"
        photo.write_bytes(b"image")

        cache_path = server.photo_thumbnail_cache_path(photo, 360)

        self.assertEqual(cache_path.parent, (Path(self.tmp.name) / ".cache" / "photo-thumbnails").resolve())
        self.assertEqual(cache_path.suffix, ".jpg")

    def test_photo_thumbnail_generation_falls_back_without_pillow(self):
        root = Path(self.tmp.name) / "photos"
        root.mkdir()
        photo = root / "front.jpg"
        photo.write_bytes(b"image")
        original_image = server.Image
        server.Image = None
        try:
            thumbnail = server.generate_photo_thumbnail(photo, 360)
        finally:
            server.Image = original_image

        self.assertIsNone(thumbnail)

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

    def test_project_asset_status_reports_existing_matching_photo(self):
        project_dir = Path(self.tmp.name) / "项目A"
        project_path = project_dir / "项目A.json"
        server.save_project_asset_file(str(project_path), "photo", "U001/front.jpg", b"image")

        result = server.project_asset_status(str(project_path), "photo", "U001/front.jpg", "5")

        self.assertTrue(result["exists"])
        self.assertTrue(result["sizeMatches"])
        self.assertEqual(result["path"], "photos/U001/front.jpg")

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


class DashboardAuthTests(unittest.TestCase):
    def test_client_identity_is_resolved_from_listener_assignment(self):
        config = server.auth.new_config()
        config["clients"]["win1"] = {
            "displayName": "张三",
            "port": 17361,
            "admin": False,
            "projects": ["P0001"],
            "disabled": False,
            "token": "w" * 32,
        }

        self.assertEqual(server.auth.client_for_id(config, "win1", "w" * 32)["displayName"], "张三")
        self.assertIsNone(server.auth.client_for_id(config, "win1", "x" * 32))
        self.assertIsNone(server.auth.client_for_id(config, "win2", "w" * 32))
        config["clients"]["win1"]["disabled"] = True
        self.assertIsNone(server.auth.client_for_id(config, "win1", "w" * 32))

    def test_client_access_ports_must_be_unique(self):
        config = server.auth.new_config()
        config["clients"]["win1"] = {"port": 17361, "token": "w" * 32}
        config["clients"]["win2"] = {"port": 17361, "token": "x" * 32}
        with self.assertRaises(ValueError):
            server.auth.validate_config(config)

    def test_project_access_is_filtered_by_user(self):
        user = {"clientId": "win1", "admin": False, "projects": ["STUDY-A"]}
        admin = {"clientId": "admin-pc", "admin": True, "projects": ["*"]}

        self.assertTrue(server.auth.can_access_project(user, "study-a"))
        self.assertFalse(server.auth.can_access_project(user, "study-b"))
        self.assertTrue(server.auth.can_access_project(admin, "study-b"))

    def test_project_path_access_uses_top_level_folder(self):
        with tempfile.TemporaryDirectory() as root:
            previous = os.environ.get("DASHBOARD_PROJECTS_ROOT")
            os.environ["DASHBOARD_PROJECTS_ROOT"] = root
            try:
                project = Path(root) / "study-a" / "study-a.json"
                outside = Path(root).parent / "outside.json"
                self.assertEqual(server.project_access_id(project), "study-a")
                self.assertEqual(server.project_asset_access_id(project.parent / "photos" / "front.jpg"), "study-a")
                self.assertIsNone(server.project_access_id(outside))
            finally:
                if previous is None:
                    os.environ.pop("DASHBOARD_PROJECTS_ROOT", None)
                else:
                    os.environ["DASHBOARD_PROJECTS_ROOT"] = previous

    def test_direct_static_project_path_is_detected(self):
        previous = os.environ.get("DASHBOARD_PROJECTS_ROOT")
        os.environ["DASHBOARD_PROJECTS_ROOT"] = str(server.app_root() / "projects")
        try:
            self.assertTrue(server.is_direct_project_static_path("/projects/private/project.json"))
            self.assertFalse(server.is_direct_project_static_path("/server/server.html"))
        finally:
            if previous is None:
                os.environ.pop("DASHBOARD_PROJECTS_ROOT", None)
            else:
                os.environ["DASHBOARD_PROJECTS_ROOT"] = previous

    def test_sensitive_windows_admin_files_are_not_static(self):
        self.assertTrue(server.is_sensitive_admin_static_path(
            "/deployment/windows-admin/downloads/win1/key/kanban_win1"
        ))
        self.assertTrue(server.is_sensitive_admin_static_path(
            "/deployment/windows-admin/.admin-connection.bat"
        ))
        self.assertFalse(server.is_sensitive_admin_static_path(
            "/deployment/windows-admin/40_add_client.bat"
        ))


class ClientListenerManagerTests(unittest.TestCase):
    class FakeServer:
        instances = []

        def __init__(self, address, handler):
            self.address = address
            self.handler = handler
            self.dashboard_client_id = None
            self.closed = False
            self.__class__.instances.append(self)

        def serve_forever(self):
            return

        def shutdown(self):
            return

        def server_close(self):
            self.closed = True

    def test_listener_reconcile_adds_and_removes_client_identity_ports(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "access.json"
            config = server.auth.new_config()
            config["clients"]["win1"] = {"port": 17361, "projects": ["P0001"], "token": "w" * 32}
            server.auth.save_config(config, path)
            manager = server.ClientListenerManager(object, self.FakeServer, path, logger=lambda message: None)

            manager.reconcile(force=True)
            self.assertEqual(manager.listeners[17361][0], "win1")
            self.assertEqual(manager.listeners[17361][1].dashboard_client_id, "win1")

            config["clients"]["win1"]["disabled"] = True
            server.auth.save_config(config, path)
            manager.reconcile(force=True)
            self.assertEqual(manager.listeners, {})

    def test_listener_rejects_private_backend_port(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "access.json"
            config = server.auth.new_config()
            config["clients"]["win1"] = {"port": 7362, "token": "w" * 32}
            server.auth.save_config(config, path)
            manager = server.ClientListenerManager(
                object,
                self.FakeServer,
                path,
                logger=lambda message: None,
                reserved_ports={7362},
            )
            with self.assertRaises(ValueError):
                manager.reconcile(force=True)


class ProjectCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write_project(self, relative_path, title):
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"title": title, "rows": []}, ensure_ascii=False, indent=4), encoding="utf-8")
        return path

    def test_sync_assigns_external_code_without_modifying_project_json(self):
        project = self.write_project("study-a/study-a.json", "研究 A")
        original = project.read_bytes()

        result = server.catalog.sync_catalog(self.root)

        self.assertEqual(result["assigned"][0]["code"], "P0001")
        self.assertEqual(result["catalog"]["projects"]["P0001"]["title"], "研究 A")
        self.assertEqual(project.read_bytes(), original)
        self.assertTrue((self.root / server.catalog.CATALOG_FILENAME).is_file())

    def test_sync_preserves_code_after_unique_title_move(self):
        project = self.write_project("old-name/project.json", "唯一标题")
        server.catalog.sync_catalog(self.root)
        moved = self.root / "new-name" / "renamed.json"
        moved.parent.mkdir()
        project.rename(moved)
        project.parent.rmdir()

        result = server.catalog.sync_catalog(self.root)

        self.assertEqual(result["moved"][0]["code"], "P0001")
        self.assertEqual(result["catalog"]["projects"]["P0001"]["path"], "new-name/renamed.json")

    def test_code_lookup_covers_project_and_assets(self):
        project = self.write_project("study-a/study-a.json", "研究 A")
        server.catalog.sync_catalog(self.root)

        self.assertEqual(server.catalog.code_for_project_path(self.root, project), "P0001")
        self.assertEqual(server.catalog.code_for_asset_path(self.root, project.parent / "photos" / "front.jpg"), "P0001")

    def test_code_can_be_changed_without_touching_project(self):
        project = self.write_project("study-a/study-a.json", "研究 A")
        original = project.read_bytes()
        server.catalog.sync_catalog(self.root)

        record = server.catalog.set_project_code(self.root, "P0001", "FIT_A")

        self.assertEqual(record["path"], "study-a/study-a.json")
        self.assertEqual(project.read_bytes(), original)


class DashboardAuthHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous_env = {
            key: os.environ.get(key)
            for key in ("DASHBOARD_PROJECTS_ROOT", "DASHBOARD_CLIENT_ACCESS_REQUIRED", "DASHBOARD_CLIENT_ACCESS_CONFIG")
        }
        auth_path = Path(self.tmp.name) / "access.json"
        os.environ["DASHBOARD_PROJECTS_ROOT"] = str(Path(self.tmp.name) / "projects")
        os.environ["DASHBOARD_CLIENT_ACCESS_REQUIRED"] = "1"
        os.environ["DASHBOARD_CLIENT_ACCESS_CONFIG"] = str(auth_path)
        server.save_server_project("study-a", {"version": 1, "rows": []}, create=True)
        server.save_server_project("study-b", {"version": 1, "rows": []}, create=True)
        server.catalog.sync_catalog(server.project_root())
        config = server.auth.new_config()
        config["clients"]["win1"] = {
            "displayName": "张三",
            "port": 17361,
            "admin": False,
            "projects": ["P0001"],
            "disabled": False,
            "token": "w" * 32,
        }
        server.auth.save_config(config, auth_path)

        class QuietDashboardHandler(server.DashboardHandler):
            def log_message(self, format_value, *args):
                pass

        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), QuietDashboardHandler)
        self.httpd.dashboard_client_id = "win1"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = "http://127.0.0.1:{}".format(self.httpd.server_address[1])
        self.client_url = self.base_url + "/?access_token=" + "w" * 32

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        for key, value in self.previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def test_project_list_uses_ssh_client_identity_and_filters_projects(self):
        cookies = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
        with opener.open(self.client_url) as response:
            self.assertEqual(response.status, 200)
            self.assertNotIn("access_token", response.geturl())
        with opener.open(self.base_url + "/api/auth/me") as response:
            identity = json.load(response)
        self.assertEqual(identity["user"]["clientId"], "win1")

        with opener.open(self.base_url + "/api/server/projects") as response:
            payload = json.load(response)

        self.assertEqual([item["id"] for item in payload["projects"]], ["study-a"])
        with opener.open(self.base_url + "/api/list-projects") as response:
            local_payload = json.load(response)
        self.assertEqual([item["id"] for item in local_payload["projects"]], ["P0001"])

    def test_client_listener_requires_its_paired_token(self):
        with self.assertRaises(urllib.error.HTTPError) as missing:
            urllib.request.urlopen(self.base_url + "/")
        self.assertEqual(missing.exception.code, 403)

        wrong = self.base_url + "/?access_token=" + "x" * 32
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            urllib.request.urlopen(wrong)
        self.assertEqual(invalid.exception.code, 403)

    def test_client_token_cookie_name_isolated_between_local_ports(self):
        self.assertEqual(
            server.client_token_cookie_name("win1"),
            "dashboard_client_token_win1",
        )
        self.assertNotEqual(
            server.client_token_cookie_name("win1"),
            server.client_token_cookie_name("win2"),
        )

    def test_access_token_is_redacted_from_request_logs(self):
        message = server.redact_access_tokens('GET /?access_token=secret-value&x=1 HTTP/1.1')
        self.assertNotIn("secret-value", message)
        self.assertIn("access_token=[REDACTED]&x=1", message)

    def test_direct_project_url_cannot_bypass_access_list(self):
        cookies = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
        opener.open(self.client_url).close()
        with self.assertRaises(urllib.error.HTTPError) as forbidden:
            opener.open(self.base_url + "/api/server/projects/study-b")

        self.assertEqual(forbidden.exception.code, 403)
        project_path = server.server_project_path("study-b")
        url = self.base_url + "/api/load-project?path=" + urllib.parse.quote(str(project_path))
        with self.assertRaises(urllib.error.HTTPError) as forbidden_path:
            opener.open(url)
        self.assertEqual(forbidden_path.exception.code, 403)

    def test_private_backend_without_client_identity_is_denied_without_redirect(self):
        del self.httpd.dashboard_client_id
        try:
            with self.assertRaises(urllib.error.HTTPError) as forbidden:
                urllib.request.urlopen(self.base_url + "/")
            self.assertEqual(forbidden.exception.code, 403)
            self.assertIsNone(forbidden.exception.headers.get("Location"))
            with urllib.request.urlopen(self.base_url + "/api/health") as response:
                self.assertEqual(json.load(response), {"ok": True})
        finally:
            self.httpd.dashboard_client_id = "win1"


if __name__ == "__main__":
    unittest.main()
