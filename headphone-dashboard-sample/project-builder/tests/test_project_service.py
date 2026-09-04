from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from native_builder.project_service import BuildRequest, ProjectService


class ProjectServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.csv = self.root / "study.csv"
        self.photos = self.root / "input-photos"
        self.output = self.root / "projects"
        (self.photos / "U1").mkdir(parents=True)
        (self.photos / "U1" / "1.jpg").write_bytes(b"photo-one")
        self.csv.write_text("用户编号,设备,舒适度\nU1,A,8\n", "utf-8")
        self.service = ProjectService(self.root / "cache")

    def tearDown(self) -> None:
        self.service.close()
        self.temp.cleanup()

    def _new_request(self) -> BuildRequest:
        return BuildRequest(
            update_mode="new",
            project_name="研究A",
            csv_path=str(self.csv),
            photo_root=str(self.photos),
            output_root=str(self.output),
            mapping_mode="sequence",
            mapping_views=["正面"],
        )

    def test_new_project_is_dashboard_compatible(self) -> None:
        result = self.service.publish(self.service.prepare(self._new_request()))
        target = Path(result.output_path)
        project = json.loads((target / "研究A.json").read_text("utf-8"))
        self.assertEqual(project["version"], 1)
        self.assertEqual(project["rows"][0]["photo_正面"], "U1/1.jpg")
        self.assertEqual(project["dashboardConfig"]["fieldRoleOverrides"]["舒适度"], "metric")
        self.assertEqual((target / "photos" / "U1" / "1.jpg").read_bytes(), b"photo-one")

    def test_new_csv_only_project_does_not_require_photos(self) -> None:
        request = BuildRequest(
            update_mode="new",
            project_name="只有数据",
            csv_path=str(self.csv),
            output_root=str(self.output),
        )
        result = self.service.publish(self.service.prepare(request))
        project = json.loads((Path(result.output_path) / "只有数据.json").read_text("utf-8"))
        self.assertEqual(len(project["rows"]), 1)
        self.assertFalse(any(key.startswith("photo_") for key in project["rows"][0]))

    def test_csv_only_preserves_photo_bytes_and_dashboard_config(self) -> None:
        created = self.service.publish(self.service.prepare(self._new_request()))
        target = Path(created.output_path)
        project_path = target / "研究A.json"
        project = json.loads(project_path.read_text("utf-8"))
        project["dashboardConfig"]["userNotes"] = {"U1": "keep"}
        project_path.write_text(json.dumps(project, ensure_ascii=False), "utf-8")
        before = (target / "photos" / "U1" / "1.jpg").read_bytes()
        replacement = self.root / "replacement.csv"
        replacement.write_text("用户编号,设备,舒适度\nU1,A,9\n", "utf-8")
        request = BuildRequest(
            update_mode="csv",
            project_path=str(project_path),
            csv_path=str(replacement),
            mapping_mode="sequence",
            mapping_views=["正面"],
        )
        updated = self.service.publish(self.service.prepare(request))
        loaded = json.loads((Path(updated.output_path) / "研究A.json").read_text("utf-8"))
        self.assertEqual((Path(updated.output_path) / "photos" / "U1" / "1.jpg").read_bytes(), before)
        self.assertEqual(loaded["dashboardConfig"]["userNotes"]["U1"], "keep")
        self.assertEqual(loaded["rows"][0]["photo_正面"], "U1/1.jpg")

    def test_dry_run_writes_nothing(self) -> None:
        request = self._new_request()
        request.project_name = "dry"
        request.dry_run = True
        result = self.service.publish(self.service.prepare(request))
        self.assertEqual(result.output_path, "")
        self.assertFalse((self.output / "dry").exists())

    def test_photo_only_merges_assets_and_preserves_csv(self) -> None:
        created = self.service.publish(self.service.prepare(self._new_request()))
        target = Path(created.output_path)
        csv_before = (target / "data" / "study.csv").read_bytes()
        new_photos = self.root / "new-photos"
        (new_photos / "U1").mkdir(parents=True)
        (new_photos / "U1" / "2.jpg").write_bytes(b"photo-two")
        request = BuildRequest(
            update_mode="photos",
            project_path=str(target / "研究A.json"),
            photo_root=str(new_photos),
            mapping_mode="sequence",
            mapping_views=["正面"],
        )
        updated = self.service.publish(self.service.prepare(request))
        next_target = Path(updated.output_path)
        self.assertEqual((next_target / "data" / "study.csv").read_bytes(), csv_before)
        self.assertEqual((next_target / "photos" / "U1" / "1.jpg").read_bytes(), b"photo-one")
        self.assertEqual((next_target / "photos" / "U1" / "2.jpg").read_bytes(), b"photo-two")
        project = json.loads((next_target / "研究A.json").read_text("utf-8"))
        self.assertEqual(project["rows"][0]["photo_正面"], "U1/2.jpg")

    def test_mapping_only_changes_assignment_without_copying_assets(self) -> None:
        created = self.service.publish(self.service.prepare(self._new_request()))
        target = Path(created.output_path)
        second = target / "photos" / "U1" / "manual.jpg"
        second.write_bytes(b"manual")
        request = BuildRequest(
            update_mode="mapping",
            project_path=str(target / "研究A.json"),
            mapping_mode="sequence",
            mapping_views=["正面"],
            photo_mapping_overrides={"U1|||A::photo_正面": "U1/manual.jpg"},
        )
        updated = self.service.publish(self.service.prepare(request))
        project = json.loads((Path(updated.output_path) / "研究A.json").read_text("utf-8"))
        self.assertEqual(project["rows"][0]["photo_正面"], "U1/manual.jpg")
        self.assertEqual((Path(updated.output_path) / "photos" / "U1" / "manual.jpg").read_bytes(), b"manual")

    def test_csv_and_photos_update_is_one_transaction(self) -> None:
        created = self.service.publish(self.service.prepare(self._new_request()))
        target = Path(created.output_path)
        replacement = self.root / "replacement.csv"
        replacement.write_text("用户编号,设备,舒适度\nU1,A,10\n", "utf-8")
        new_photos = self.root / "all-photos"
        (new_photos / "U1").mkdir(parents=True)
        (new_photos / "U1" / "2.jpg").write_bytes(b"photo-two")
        request = BuildRequest(
            update_mode="all", project_path=str(target / "研究A.json"), csv_path=str(replacement),
            photo_root=str(new_photos), mapping_mode="sequence", mapping_views=["正面"],
        )
        updated = self.service.publish(self.service.prepare(request))
        project = json.loads((Path(updated.output_path) / "研究A.json").read_text("utf-8"))
        self.assertEqual(project["rows"][0]["舒适度"], "10")
        self.assertEqual(project["rows"][0]["photo_正面"], "U1/2.jpg")

    def test_failed_validation_leaves_original_project_untouched(self) -> None:
        created = self.service.publish(self.service.prepare(self._new_request()))
        target = Path(created.output_path)
        before = (target / "研究A.json").read_bytes()
        request = BuildRequest(
            update_mode="mapping", project_path=str(target / "研究A.json"),
            mapping_mode="sequence", mapping_views=["正面"],
        )
        prepared = self.service.prepare(request)
        with mock.patch.object(self.service, "_validate_staging", side_effect=ValueError("forced")):
            with self.assertRaisesRegex(ValueError, "forced"):
                self.service.publish(prepared)
        self.assertEqual((target / "研究A.json").read_bytes(), before)

    def test_duplicate_stable_keys_block_publish(self) -> None:
        duplicate = self.root / "duplicate.csv"
        duplicate.write_text("用户编号,设备\nU1,A\nU1,A\n", "utf-8")
        request = self._new_request()
        request.csv_path = str(duplicate)
        with self.assertRaisesRegex(ValueError, "稳定行键不唯一"):
            self.service.prepare(request)

    def test_manual_variable_category_is_written_for_dashboard(self) -> None:
        request = self._new_request()
        request.field_role_overrides = {"舒适度": "pressure"}
        prepared = self.service.prepare(request)
        self.assertEqual(prepared.project["dashboardConfig"]["fieldRoleOverrides"]["舒适度"], "pressure")

    def test_multiple_user_id_categories_are_rejected(self) -> None:
        request = self._new_request()
        request.field_role_overrides = {"设备": "user_id"}
        with self.assertRaisesRegex(ValueError, "只能有一个"):
            self.service.prepare(request)

    def test_photo_override_cannot_escape_project_directory(self) -> None:
        request = self._new_request()
        request.photo_mapping_overrides = {"U1|||A::photo_正面": "../../outside.jpg"}
        prepared = self.service.prepare(request)
        with self.assertRaisesRegex(ValueError, "越出项目目录"):
            self.service.publish(prepared)

    def test_strict_blocks_missing_mapping(self) -> None:
        request = self._new_request()
        request.mapping_views = ["正面", "侧面"]
        request.strict = True
        with self.assertRaisesRegex(ValueError, "strict"):
            self.service.prepare(request)


if __name__ == "__main__":
    unittest.main()
