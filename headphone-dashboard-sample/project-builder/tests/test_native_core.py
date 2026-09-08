from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from native_builder.core import (
    MappingConfig,
    PhotoFile,
    folder_matches,
    infer_field_role,
    infer_mapping_fields,
    make_extra_photo_assignment,
    map_photos,
    read_csv_file,
    reorder_device_groups,
    set_slot,
    swap_device_groups,
    swap_ear_groups,
    swap_slots,
)


class NativeCoreTests(unittest.TestCase):
    def test_csv_supports_bom_gb18030_and_multiline_quotes(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "data.csv"
            path.write_bytes('用户编号,备注\r\nU1,"第一行\n第二行"\r\n'.encode("gb18030"))
            rows, headers, encoding = read_csv_file(path)
            self.assertEqual(headers, ["用户编号", "备注"])
            self.assertEqual(rows[0]["备注"], "第一行\n第二行")
            self.assertEqual(encoding, "gb18030")

    def test_field_role_priority_matches_dashboard_contract(self) -> None:
        rows = [
            {"用户编号": "U1", "设备": "A", "舒适度": "8", "耳甲腔宽度": "31", "耳后": "3", "干涉面积": "2"},
            {"用户编号": "U1", "设备": "B", "舒适度": "7", "耳甲腔宽度": "31", "耳后": "4", "干涉面积": "5"},
        ]
        self.assertEqual(infer_field_role("舒适度", rows), "metric")
        self.assertEqual(infer_field_role("耳甲腔宽度", rows), "ear_size")
        self.assertEqual(infer_field_role("耳后", rows), "pressure")
        self.assertEqual(infer_field_role("干涉面积", rows), "interference")

    def test_sequence_mapping_and_manual_swap(self) -> None:
        rows = [{"用户编号": "U1", "设备": "A"}, {"用户编号": "U1", "设备": "B"}]
        photos = [
            PhotoFile("U1/10.jpg", "/tmp/10.jpg", "10.jpg", "U1"),
            PhotoFile("U1/2.jpg", "/tmp/2.jpg", "2.jpg", "U1"),
        ]
        config = MappingConfig(mode="sequence", user_field="用户编号", device_field="设备", views=["正面"])
        result = map_photos(rows, photos, config)
        self.assertEqual(result.rows[0]["photo_正面"], "U1/2.jpg")
        self.assertEqual(result.rows[1]["photo_正面"], "U1/10.jpg")
        swap_slots(result, 0, 1)
        self.assertEqual(result.rows[0]["photo_正面"], "U1/10.jpg")
        set_slot(result, 1, "")
        self.assertEqual(result.rows[1]["photo_正面"], "")

    def test_group_adjustments_update_all_matching_slots(self) -> None:
        rows = [
            {"用户编号": "U1", "设备": "A", "耳侧": "左耳"},
            {"用户编号": "U1", "设备": "A", "耳侧": "右耳"},
            {"用户编号": "U1", "设备": "B", "耳侧": "左耳"},
            {"用户编号": "U1", "设备": "B", "耳侧": "右耳"},
        ]
        photos = [PhotoFile(f"U1/{index}.jpg", f"/tmp/{index}.jpg", f"{index}.jpg", "U1") for index in range(1, 5)]
        result = map_photos(rows, photos, MappingConfig(mode="sequence", user_field="用户编号", device_field="设备", ear_field="耳侧", views=["正面"]))
        before_a = [slot["value"] for slot in result.slots if slot["device"] == "A"]
        before_b = [slot["value"] for slot in result.slots if slot["device"] == "B"]
        swap_device_groups(result, "U1", "A", "B")
        self.assertEqual([slot["value"] for slot in result.slots if slot["device"] == "A"], before_b)
        self.assertEqual([slot["value"] for slot in result.slots if slot["device"] == "B"], before_a)
        left_before = [slot["value"] for slot in result.slots if slot["ear"] == "左耳"]
        swap_ear_groups(result, "U1")
        self.assertNotEqual([slot["value"] for slot in result.slots if slot["ear"] == "左耳"], left_before)
        self.assertEqual(len(result.slots), 4)

    def test_global_ear_swap_is_atomic_and_preserves_every_photo(self) -> None:
        rows = [{"用户编号": user, "设备": "A"} for user in ("U1", "U2")]
        photos = [
            PhotoFile(f"{user}/{index}.jpg", f"/tmp/{user}-{index}.jpg", f"{index}.jpg", user)
            for user in ("U1", "U2") for index in (1, 2)
        ]
        result = map_photos(rows, photos, MappingConfig(
            mode="sequence", user_field="用户编号", device_field="设备", views=["正面"], photo_ear_mode=True,
        ))
        before = [slot["value"] for slot in result.slots]
        swap_ear_groups(result, None)
        after = [slot["value"] for slot in result.slots]
        self.assertCountEqual(after, before)
        self.assertEqual(after, [before[1], before[0], before[3], before[2]])

    def test_device_order_reassigns_all_users_atomically_without_loss(self) -> None:
        rows = [{"用户编号": user, "设备": device} for user in ("U1", "U2") for device in ("A", "B", "C")]
        photos = [
            PhotoFile(f"{user}/{index}.jpg", f"/tmp/{user}-{index}.jpg", f"{index}.jpg", user)
            for user in ("U1", "U2") for index in (1, 2, 3)
        ]
        result = map_photos(rows, photos, MappingConfig(mode="sequence", user_field="用户编号", device_field="设备", views=["正面"]))
        before = [slot["value"] for slot in result.slots]
        reorder_device_groups(result, ["A", "B", "C"], ["B", "C", "A"])
        after = [slot["value"] for slot in result.slots]
        self.assertCountEqual(after, before)
        by_user_device = {(slot["user"], slot["device"]): slot["value"] for slot in result.slots}
        self.assertEqual(by_user_device[("U1", "B")], "U1/1.jpg")
        self.assertEqual(by_user_device[("U1", "C")], "U1/2.jpg")
        self.assertEqual(by_user_device[("U1", "A")], "U1/3.jpg")

    def test_unused_photo_can_be_promoted_to_named_view_for_matching_user(self) -> None:
        rows = [{"用户编号": "U1", "设备": "A"}, {"用户编号": "U2", "设备": "A"}]
        photos = [
            PhotoFile("U1/A/正面/1.jpg", "/tmp/1.jpg", "1.jpg", "U1"),
            PhotoFile("U1/A/补拍/x.jpg", "/tmp/x.jpg", "x.jpg", "U1"),
            PhotoFile("U2/A/正面/2.jpg", "/tmp/2.jpg", "2.jpg", "U2"),
        ]
        config = MappingConfig(mode="folders", user_field="用户编号", device_field="设备", views=["正面"])
        initial = map_photos(rows, photos, config)
        self.assertIn("U1/A/补拍/x.jpg", initial.unused_photos)
        assignment = make_extra_photo_assignment(initial, photos, config, "U1/A/补拍/x.jpg", "U1", "补拍")
        config.extra_assignments.append(assignment)
        updated = map_photos(rows, photos, config)
        self.assertEqual(updated.rows[0][assignment["field"]], "U1/A/补拍/x.jpg")
        self.assertEqual(updated.rows[1][assignment["field"]], "")
        self.assertNotIn("U1/A/补拍/x.jpg", updated.unused_photos)

    def test_unused_photo_requires_device_choice_when_multi_device_path_is_ambiguous(self) -> None:
        rows = [{"用户编号": "U1", "设备": device} for device in ("A", "B")]
        photos = [PhotoFile("U1/补拍/x.jpg", "/tmp/x.jpg", "x.jpg", "U1")]
        config = MappingConfig(mode="folders", user_field="用户编号", device_field="设备", views=["正面"])
        initial = map_photos(rows, photos, config)
        with self.assertRaisesRegex(ValueError, "请选择目标设备"):
            make_extra_photo_assignment(initial, photos, config, "U1/补拍/x.jpg", "U1", "补拍")
        assignment = make_extra_photo_assignment(initial, photos, config, "U1/补拍/x.jpg", "U1", "补拍", "B")
        self.assertEqual(assignment["device"], "B")

    def test_folder_mapping_understands_arbitrary_level_order(self) -> None:
        rows = [{"姓名": "张三", "耳侧": "左耳", "样机": "A"}]
        photos = [PhotoFile("张三/A/正面/左耳/1.jpg", "/tmp/1.jpg", "1.jpg", "张三")]
        user, ear, device = infer_mapping_fields(rows)
        result = map_photos(rows, photos, MappingConfig(mode="folders", user_field=user, ear_field=ear, device_field=device, views=["正面"]))
        self.assertEqual(result.rows[0]["photo_左耳_正面"], "张三/A/正面/左耳/1.jpg")
        self.assertFalse(result.audit)

    def test_folder_matching_uses_delimited_tokens_without_prefix_collisions(self) -> None:
        self.assertTrue(folder_matches("participant_U1", "U1"))
        self.assertTrue(folder_matches("左侧", "左耳"))
        self.assertFalse(folder_matches("U10", "U1"))
        self.assertFalse(folder_matches("AA", "A"))

    def test_folder_mapping_preserves_duplicate_analysis_rows_and_shares_photo(self) -> None:
        rows = [
            {"用户编号": "U1", "设备": "A", "试次": "1", "舒适度": "8"},
            {"用户编号": "U1", "设备": "A", "试次": "2", "舒适度": "7"},
        ]
        photos = [PhotoFile("participant_U1/A/正面/1.jpg", "/tmp/1.jpg", "1.jpg", "participant_U1")]
        result = map_photos(rows, photos, MappingConfig(mode="folders", user_field="用户编号", device_field="设备", views=["正面"]))
        self.assertEqual([row["试次"] for row in result.rows], ["1", "2"])
        self.assertEqual([row["photo_正面"] for row in result.rows], ["participant_U1/A/正面/1.jpg"] * 2)
        self.assertFalse(result.audit)
        set_slot(result, 0, "participant_U1/A/正面/manual.jpg")
        self.assertEqual([row["photo_正面"] for row in result.rows], ["participant_U1/A/正面/manual.jpg"] * 2)

    def test_folder_missing_slot_is_audited_once_for_duplicate_rows(self) -> None:
        rows = [
            {"用户编号": "U1", "设备": "A", "试次": "1"},
            {"用户编号": "U1", "设备": "A", "试次": "2"},
        ]
        result = map_photos(rows, [], MappingConfig(mode="folders", user_field="用户编号", device_field="设备", views=["正面"]))
        self.assertEqual(len([item for item in result.audit if item["status"] == "missing"]), 1)


if __name__ == "__main__":
    unittest.main()
