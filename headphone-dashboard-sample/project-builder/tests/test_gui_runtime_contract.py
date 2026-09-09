from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class GuiRuntimeContractTests(unittest.TestCase):
    def test_worker_results_are_dispatched_to_a_main_window_slot(self) -> None:
        source = (ROOT / "native_builder" / "gui.py").read_text("utf-8")
        self.assertIn("completed = Signal(object, object)", source)
        self.assertIn("worker.completed.connect(self._task_completed, Qt.ConnectionType.QueuedConnection)", source)
        self.assertNotIn("worker.completed.connect(lambda", source)
        self.assertNotIn("QApplication.processEvents()", source)

    def test_windows_choosers_and_ui_watchdog_have_safe_fallbacks(self) -> None:
        gui = (ROOT / "native_builder" / "gui.py").read_text("utf-8")
        runtime_log = (ROOT / "native_builder" / "runtime_log.py").read_text("utf-8")
        self.assertIn("QFileDialog.Option.DontUseNativeDialog", gui)
        self.assertIn("hang_path = arm_hang_trace()", gui)
        self.assertIn('with_name("builder-hang.log")', runtime_log)

    def test_mapping_editor_exposes_global_and_recovery_controls(self) -> None:
        source = (ROOT / "native_builder" / "gui.py").read_text("utf-8")
        self.assertIn("全部用户左右耳互换", source)
        self.assertIn("设备照片顺序（顺序模式）", source)
        self.assertIn("只应用到当前用户", source)
        self.assertIn("应用到全部用户", source)
        self.assertIn("未使用 / 补拍照片（按用户分组）", source)
        self.assertIn("self.extra_device.currentData()", source)
        self.assertIn("make_extra_photo_assignment", source)


if __name__ == "__main__":
    unittest.main()
