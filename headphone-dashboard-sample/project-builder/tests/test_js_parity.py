from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

from native_builder.core import MappingConfig, PhotoFile, map_photos, resolve_field_roles


ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which("node"), "Node.js is required for dashboard parity checks")
class JavaScriptParityTests(unittest.TestCase):
    def _node(self, script: str, payload: dict) -> dict:
        output = subprocess.run(
            ["node", "-e", script],
            cwd=ROOT,
            input=json.dumps(payload, ensure_ascii=False),
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(output.stdout)

    def test_field_role_contract_matches_dashboard(self) -> None:
        rows = [
            {"用户编号": "U1", "设备": "A", "舒适度": "8", "耳甲腔宽度": "31", "耳后": "3", "干涉面积": "2"},
            {"用户编号": "U1", "设备": "B", "舒适度": "7", "耳甲腔宽度": "31", "耳后": "4", "干涉面积": "5"},
        ]
        js = self._node(
            "const fs=require('fs');const C=require('./dashboard-core.js');const p=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(C.resolveFieldRoles(Object.keys(p.rows[0]),p.rows,{})));",
            {"rows": rows},
        )
        self.assertEqual(resolve_field_roles(list(rows[0]), rows), js)

    def test_sequence_mapping_contract_matches_dashboard(self) -> None:
        rows = [{"user_id": "U1", "device_name": "A"}, {"user_id": "U1", "device_name": "B"}]
        photos = [
            {"relative_path": "U1/10.jpg", "absolute_path": "/tmp/10.jpg", "name": "10.jpg", "user_folder": "U1"},
            {"relative_path": "U1/2.jpg", "absolute_path": "/tmp/2.jpg", "name": "2.jpg", "user_folder": "U1"},
        ]
        js = self._node(
            "const fs=require('fs');const C=require('./dashboard-core.js');const p=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(C.mapPhotosToRows(p.rows,p.photos,p.options).mapped));",
            {"rows": rows, "photos": photos, "options": {"mode": "sequence", "userField": "user_id", "earField": "", "deviceField": "device_name", "views": ["正面"]}},
        )
        native = map_photos(rows, [PhotoFile(**item) for item in photos], MappingConfig(mode="sequence", user_field="user_id", device_field="device_name", views=["正面"]))
        self.assertEqual(native.rows, js)

    def test_sequence_bare_ear_contract_matches_dashboard(self) -> None:
        rows = [{"user_id": "U1", "device_name": "A"}, {"user_id": "U1", "device_name": "B"}]
        photos = [
            {"relative_path": "U1/1.jpg", "absolute_path": "/tmp/1.jpg", "name": "1.jpg", "user_folder": "U1"},
            {"relative_path": "U1/2.jpg", "absolute_path": "/tmp/2.jpg", "name": "2.jpg", "user_folder": "U1"},
            {"relative_path": "U1/3.jpg", "absolute_path": "/tmp/3.jpg", "name": "3.jpg", "user_folder": "U1"},
        ]
        options = {"mode": "sequence", "userField": "user_id", "earField": "", "deviceField": "device_name", "views": ["正面"], "includeBareEar": True}
        js = self._node(
            "const fs=require('fs');const C=require('./dashboard-core.js');const p=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(C.mapPhotosToRows(p.rows,p.photos,p.options).mapped));",
            {"rows": rows, "photos": photos, "options": options},
        )
        native = map_photos(rows, [PhotoFile(**item) for item in photos], MappingConfig(mode="sequence", user_field="user_id", device_field="device_name", views=["正面"], include_bare_ear=True))
        self.assertEqual(native.rows, js)

    def test_photo_ear_mode_contract_matches_dashboard(self) -> None:
        rows = [{"user_id": "U1", "device_name": "A"}]
        photos = [
            {"relative_path": "U1/1.jpg", "absolute_path": "/tmp/1.jpg", "name": "1.jpg", "user_folder": "U1"},
            {"relative_path": "U1/2.jpg", "absolute_path": "/tmp/2.jpg", "name": "2.jpg", "user_folder": "U1"},
        ]
        options = {"mode": "sequence", "userField": "user_id", "earField": "", "deviceField": "device_name", "views": ["正面"], "photoEarMode": True}
        js = self._node(
            "const fs=require('fs');const C=require('./dashboard-core.js');const p=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(C.mapPhotosToRows(p.rows,p.photos,p.options).mapped));",
            {"rows": rows, "photos": photos, "options": options},
        )
        native = map_photos(rows, [PhotoFile(**item) for item in photos], MappingConfig(mode="sequence", user_field="user_id", device_field="device_name", views=["正面"], photo_ear_mode=True))
        self.assertEqual(native.rows, js)

    def test_folder_mode_expands_missing_device_rows_like_dashboard(self) -> None:
        rows = [{"姓名": "张三", "样机": "A", "舒适度": "8"}]
        photos = [
            {"relative_path": "张三/A/正面/1.jpg", "absolute_path": "/tmp/1.jpg", "name": "1.jpg", "user_folder": "张三"},
            {"relative_path": "张三/B/正面/2.jpg", "absolute_path": "/tmp/2.jpg", "name": "2.jpg", "user_folder": "张三"},
        ]
        options = {"mode": "folders", "userField": "姓名", "earField": "", "deviceField": "样机", "views": ["正面"]}
        js = self._node(
            "const fs=require('fs');const C=require('./dashboard-core.js');const p=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(C.mapPhotosToRows(p.rows,p.photos,p.options).mapped));",
            {"rows": rows, "photos": photos, "options": options},
        )
        native = map_photos(rows, [PhotoFile(**item) for item in photos], MappingConfig(mode="folders", user_field="姓名", device_field="样机", views=["正面"]))
        self.assertEqual(native.rows, js)


if __name__ == "__main__":
    unittest.main()
