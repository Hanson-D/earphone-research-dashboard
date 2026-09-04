from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from native_builder.core import (
    MappingConfig,
    PhotoFile,
    infer_field_role,
    infer_mapping_fields,
    map_photos,
    read_csv_file,
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

    def test_folder_mapping_understands_arbitrary_level_order(self) -> None:
        rows = [{"姓名": "张三", "耳侧": "左耳", "样机": "A"}]
        photos = [PhotoFile("张三/A/正面/左耳/1.jpg", "/tmp/1.jpg", "1.jpg", "张三")]
        user, ear, device = infer_mapping_fields(rows)
        result = map_photos(rows, photos, MappingConfig(mode="folders", user_field=user, ear_field=ear, device_field=device, views=["正面"]))
        self.assertEqual(result.rows[0]["photo_左耳_正面"], "张三/A/正面/左耳/1.jpg")
        self.assertFalse(result.audit)


if __name__ == "__main__":
    unittest.main()
