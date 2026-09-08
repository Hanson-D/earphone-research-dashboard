from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Callable

from PySide6.QtCore import QAbstractListModel, QAbstractTableModel, QModelIndex, QObject, QSize, Qt, QThread, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QIcon, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListView,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QProgressBar,
    QScrollArea,
    QSplitter,
    QTabWidget,
    QTableView,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QToolBar,
    QVBoxLayout,
    QWidget,
)

from .core import FIELD_ROLE_LABELS, MappingConfig, make_extra_photo_assignment, mapping_overrides, parts_include, path_parts, reorder_device_groups, restore_slots, set_slot, swap_ear_groups, swap_slots
from .project_service import BuildRequest, BuildResult, ProjectService
from .runtime_log import arm_hang_trace, cancel_hang_trace, configure_runtime_logging, get_logger


MODE_LABELS = {
    "new": "新建项目",
    "csv": "仅更新 CSV",
    "photos": "仅更新照片",
    "all": "更新 CSV + 照片",
    "mapping": "仅更新映射",
}
LOGGER = get_logger()


class CsvPreviewModel(QAbstractTableModel):
    """Read-only, lazy CSV preview that does not allocate a widget per cell."""

    def __init__(self, limit: int = 200):
        super().__init__()
        self.limit = limit
        self.headers: list[str] = []
        self.rows: list[dict[str, str]] = []

    def replace(self, headers: list[str], rows: list[dict[str, str]]) -> None:
        self.beginResetModel()
        self.headers = list(headers)
        self.rows = rows[:self.limit]
        self.endResetModel()

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:  # noqa: N802
        return 0 if parent.isValid() else len(self.rows)

    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:  # noqa: N802
        return 0 if parent.isValid() else len(self.headers)

    def data(self, index: QModelIndex, role: int = Qt.DisplayRole) -> Any:
        if not index.isValid() or role != Qt.DisplayRole:
            return None
        return str(self.rows[index.row()].get(self.headers[index.column()], ""))

    def headerData(self, section: int, orientation: Qt.Orientation, role: int = Qt.DisplayRole) -> Any:  # noqa: N802
        if role != Qt.DisplayRole:
            return None
        if orientation == Qt.Horizontal and 0 <= section < len(self.headers):
            return self.headers[section]
        return section + 1


class StringListModel(QAbstractListModel):
    """Lazy text list used for users and potentially large unused-photo sets."""

    def __init__(self):
        super().__init__()
        self.values: list[str] = []

    def replace(self, values: list[str]) -> None:
        self.beginResetModel()
        self.values = list(values)
        self.endResetModel()

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:  # noqa: N802
        return 0 if parent.isValid() else len(self.values)

    def data(self, index: QModelIndex, role: int = Qt.DisplayRole) -> Any:
        if not index.isValid() or role != Qt.DisplayRole:
            return None
        return self.values[index.row()]


class Worker(QObject):
    completed = Signal(object, object)
    failed = Signal(str)
    progress = Signal(str, int)
    finished = Signal()

    def __init__(self, callback: Callable[[Callable[[str, int], None]], Any], on_success: Callable[[Any], None]):
        super().__init__()
        self.callback = callback
        self.on_success = on_success

    def run(self) -> None:
        try:
            self.completed.emit(self.callback(self.progress.emit), self.on_success)
        except Exception as error:
            LOGGER.exception("background task failed")
            self.failed.emit(str(error))
        finally:
            self.finished.emit()


class LazyPhotoCombo(QComboBox):
    """Keep large photo candidate lists out of initial UI construction."""

    def __init__(self, candidates: list[str], current: str):
        super().__init__()
        self._candidates = candidates
        self._loaded = False
        self.addItem("— 空槽位 —", "")
        if current:
            self.addItem(current, current)
            self.setCurrentIndex(1)

    def showPopup(self) -> None:  # noqa: N802
        if not self._loaded:
            current = str(self.currentData() or "")
            self.blockSignals(True)
            self.clear()
            self.addItem("— 空槽位 —", "")
            for relative in self._candidates:
                self.addItem(relative, relative)
            selected = self.findData(current)
            if selected < 0 and current:
                self.addItem(current, current)
                selected = self.count() - 1
            self.setCurrentIndex(max(0, selected))
            self.blockSignals(False)
            self._loaded = True
        super().showPopup()


class PhotoCard(QFrame):
    changed = Signal(int, str)
    selected = Signal(int, bool)

    def __init__(self, slot_index: int, slot: dict[str, Any], candidates: list[str], thumbnail: str, absolute: str):
        super().__init__()
        self.slot_index = slot_index
        self.setFrameShape(QFrame.StyledPanel)
        self.setMinimumWidth(230)
        layout = QVBoxLayout(self)
        title = QCheckBox(f"{slot['device'] or '无设备'} · {slot['ear'] or '单耳'} · {slot['label']}")
        title.toggled.connect(lambda checked: self.selected.emit(self.slot_index, checked))
        layout.addWidget(title)
        image = QPushButton("无照片")
        image.setFixedSize(205, 150)
        image.setIconSize(QSize(185, 130))
        if thumbnail and Path(thumbnail).is_file():
            image.setIcon(QIcon(QPixmap(thumbnail)))
            image.setText("")
        if absolute:
            image.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(absolute)))
            image.setToolTip("点击打开原图")
        layout.addWidget(image, alignment=Qt.AlignCenter)
        source = QLabel("人工" if slot["source"] != "automatic" else "自动")
        source.setProperty("kind", slot["source"])
        layout.addWidget(source)
        combo = LazyPhotoCombo(candidates, str(slot["value"] or ""))
        combo.currentIndexChanged.connect(lambda: self.changed.emit(self.slot_index, str(combo.currentData() or "")))
        layout.addWidget(combo)
        path_label = QLabel(slot["value"] or "缺失")
        path_label.setWordWrap(True)
        path_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        layout.addWidget(path_label)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.log_path = configure_runtime_logging()
        LOGGER.info("application started")
        self.setWindowTitle("耳机研究项目制作器 · MVP")
        self.resize(1320, 860)
        self.service = ProjectService()
        self.prepared: BuildResult | None = None
        self.role_combos: dict[str, QComboBox] = {}
        self.auto_roles: dict[str, str] = {}
        self.device_order: list[str] = []
        self.extra_photo_assignments: list[dict[str, str]] = []
        self.unused_entries: list[tuple[str, str]] = []
        self.selected_slots: set[int] = set()
        self._threads: list[QThread] = []
        self._workers: list[Worker] = []
        self._worker_by_thread: dict[QThread, Worker] = {}
        self._thumbnail_jobs: set[str] = set()
        self._close_pending = False
        self._service_closed = False
        self._build_ui()

    def closeEvent(self, event) -> None:  # noqa: N802
        if any(thread.isRunning() for thread in self._threads):
            LOGGER.info("close requested while background tasks are active; hiding until completion")
            self._close_pending = True
            self.hide()
            event.ignore()
            return
        self._close_service()
        super().closeEvent(event)

    def _close_service(self) -> None:
        if not self._service_closed:
            self.service.close()
            self._service_closed = True

    def _thread_finished(self) -> None:
        thread = self.sender()
        if not isinstance(thread, QThread):
            return
        worker = self._worker_by_thread.pop(thread, None)
        if thread in self._threads:
            self._threads.remove(thread)
        if worker and worker in self._workers:
            self._workers.remove(worker)
        if self._close_pending and not any(item.isRunning() for item in self._threads):
            LOGGER.info("background tasks finished after close request")
            self._close_service()
            QApplication.quit()

    def _build_ui(self) -> None:
        toolbar = QToolBar("项目")
        self.addToolBar(toolbar)
        for label, callback in (("新建", self.reset), ("打开项目", self.open_project), ("读取并预览", self.preview), ("发布项目", self.publish)):
            action = toolbar.addAction(label)
            action.triggered.connect(callback)
        self.status = QLabel("请选择 CSV 和照片目录，或打开已有项目")
        self.status.setToolTip(f"运行日志：{self.log_path}")
        toolbar.addSeparator()
        toolbar.addWidget(self.status)
        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setFixedWidth(180)
        self.progress.hide()
        toolbar.addWidget(self.progress)
        log_action = toolbar.addAction("打开日志")
        log_action.triggered.connect(self.open_log_folder)

        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)
        self.tabs.addTab(self._project_page(), "01 项目与输入")
        self.tabs.addTab(self._csv_page(), "02 CSV 与变量类别")
        self.tabs.addTab(self._photo_page(), "03 照片规则")
        self.tabs.addTab(self._mapping_page(), "04 映射检查与调整")
        self.tabs.addTab(self._publish_page(), "05 发布")
        self.setStyleSheet("""
            QMainWindow { background: #f4f6f8; }
            QTabWidget::pane { background: white; border: 1px solid #d9e0e7; }
            QFrame { background: white; border: 1px solid #d9e0e7; border-radius: 8px; }
            QPushButton { min-height: 28px; padding: 2px 10px; }
            QLineEdit, QComboBox { min-height: 28px; }
            QLabel[kind="manual"], QLabel[kind="preserved"] { color: #a85400; font-weight: 600; }
        """)

    def _project_page(self) -> QWidget:
        page = QWidget()
        form = QFormLayout(page)
        self.update_mode = QComboBox()
        for value, label in MODE_LABELS.items():
            self.update_mode.addItem(label, value)
        self.project_name = QLineEdit()
        self.project_path = self._path_row(form, "已有项目 JSON / 文件夹", self._choose_project)
        self.csv_path = self._path_row(form, "源 CSV", lambda: self._choose_file(self.csv_path, "CSV (*.csv)"))
        self.photo_root = self._path_row(form, "照片根目录", lambda: self._choose_dir(self.photo_root))
        self.output_root = self._path_row(form, "新项目输出目录", lambda: self._choose_dir(self.output_root))
        form.insertRow(0, "操作模式", self.update_mode)
        form.insertRow(1, "项目名称", self.project_name)
        note = QLabel("更新范围由“操作模式”决定：未选中的 CSV、照片资产和分析配置必须保持不变。")
        note.setWordWrap(True)
        form.addRow(note)
        return page

    def _path_row(self, form: QFormLayout, label: str, callback: Callable[[], None]) -> QLineEdit:
        edit = QLineEdit()
        button = QPushButton("选择…")
        button.clicked.connect(callback)
        row = QWidget()
        layout = QHBoxLayout(row)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(edit, 1)
        layout.addWidget(button)
        form.addRow(label, row)
        return edit

    def _csv_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.addWidget(QLabel("变量类别可以随时更换；发布前会把人工结果写入 dashboardConfig.fieldRoleOverrides。"))
        splitter = QSplitter(Qt.Vertical)
        self.csv_model = CsvPreviewModel()
        self.csv_table = QTableView()
        self.csv_table.setModel(self.csv_model)
        self.csv_table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.roles_table = QTableWidget(0, 3)
        self.roles_table.setHorizontalHeaderLabels(["字段", "自动类别", "最终类别（可更换）"])
        splitter.addWidget(self.csv_table)
        splitter.addWidget(self.roles_table)
        layout.addWidget(splitter)
        restore = QPushButton("恢复全部自动类别")
        restore.clicked.connect(self.restore_auto_roles)
        layout.addWidget(restore, alignment=Qt.AlignLeft)
        return page

    def _photo_page(self) -> QWidget:
        page = QWidget()
        form = QFormLayout(page)
        self.mapping_mode = QComboBox()
        for value, label in (("auto", "自动判断"), ("folders", "子文件夹逻辑"), ("sequence", "照片顺序逻辑")):
            self.mapping_mode.addItem(label, value)
        self.user_field = QComboBox()
        self.ear_field = QComboBox()
        self.device_field = QComboBox()
        self.views = QLineEdit("正面,侧面,后侧")
        self.photo_ear_mode = QCheckBox("CSV 没有耳侧列，但照片区分左右耳")
        self.single_ear = QCheckBox("强制单耳模式")
        self.include_bare = QCheckBox("包含空耳照片")
        self.split_bare = QCheckBox("空耳按左右耳分开")
        form.addRow("映射逻辑", self.mapping_mode)
        form.addRow("用户字段", self.user_field)
        form.addRow("耳侧字段", self.ear_field)
        form.addRow("设备字段", self.device_field)
        form.addRow("视角顺序", self.views)
        form.addRow(self.photo_ear_mode)
        form.addRow(self.single_ear)
        form.addRow(self.include_bare)
        form.addRow(self.split_bare)
        button = QPushButton("重新扫描并生成映射预览")
        button.clicked.connect(self.preview)
        form.addRow(button)
        return page

    def _mapping_page(self) -> QWidget:
        page = QWidget()
        outer = QVBoxLayout(page)
        actions = QHBoxLayout()
        for label, callback in (("交换所选两张", self.swap_selected), ("当前用户左右耳互换", self.swap_ears), ("全部用户左右耳互换", self.swap_all_ears), ("恢复当前用户自动映射", self.restore_user), ("恢复全部", self.restore_all)):
            button = QPushButton(label)
            button.clicked.connect(callback)
            actions.addWidget(button)
        actions.addStretch()
        outer.addLayout(actions)
        splitter = QSplitter()
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.addWidget(QLabel("用户 / 状态"))
        self.user_model = StringListModel()
        self.user_list = QListView()
        self.user_list.setModel(self.user_model)
        self.user_list.selectionModel().currentChanged.connect(self._user_selection_changed)
        left_layout.addWidget(self.user_list, 1)
        left_layout.addWidget(QLabel("未使用 / 补拍照片（按用户分组）"))
        self.unused_model = StringListModel()
        self.unused_list = QListView()
        self.unused_list.setModel(self.unused_model)
        self.unused_list.selectionModel().currentChanged.connect(self._unused_selection_changed)
        left_layout.addWidget(self.unused_list, 1)
        self.extra_device = QComboBox()
        self.extra_device.addItem("自动识别设备", "")
        left_layout.addWidget(self.extra_device)
        self.extra_view_name = QLineEdit()
        self.extra_view_name.setPlaceholderText("新视角名称，例如：佩戴后侧补拍")
        left_layout.addWidget(self.extra_view_name)
        promote = QPushButton("将所选照片归入对应用户/设备并命名视角")
        promote.clicked.connect(self.promote_unused_photo)
        left_layout.addWidget(promote)
        left_layout.addWidget(QLabel("设备照片顺序（顺序模式，全用户统一）"))
        self.device_order_model = StringListModel()
        self.device_order_list = QListView()
        self.device_order_list.setModel(self.device_order_model)
        self.device_order_list.setMaximumHeight(140)
        left_layout.addWidget(self.device_order_list)
        device_actions = QHBoxLayout()
        self.device_up = QPushButton("上移")
        self.device_down = QPushButton("下移")
        self.device_up.clicked.connect(lambda: self.move_device_order(-1))
        self.device_down.clicked.connect(lambda: self.move_device_order(1))
        device_actions.addWidget(self.device_up)
        device_actions.addWidget(self.device_down)
        left_layout.addLayout(device_actions)
        splitter.addWidget(left)
        self.cards = QWidget()
        self.cards_layout = QGridLayout(self.cards)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(self.cards)
        splitter.addWidget(scroll)
        splitter.setStretchFactor(1, 1)
        outer.addWidget(splitter)
        return page

    def _publish_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        self.publish_summary = QTextEdit()
        self.publish_summary.setReadOnly(True)
        layout.addWidget(self.publish_summary)
        self.strict = QCheckBox("严格模式：存在映射问题时阻止发布")
        layout.addWidget(self.strict)
        button = QPushButton("确认当前更新范围并发布")
        button.clicked.connect(self.publish)
        layout.addWidget(button, alignment=Qt.AlignRight)
        return page

    def _choose_file(self, edit: QLineEdit, file_filter: str) -> None:
        LOGGER.info("opening Qt file chooser filter=%s", file_filter)
        arm_hang_trace()
        try:
            value, _ = QFileDialog.getOpenFileName(
                self, "选择文件", edit.text(), file_filter,
                options=QFileDialog.Option.DontUseNativeDialog,
            )
            if value:
                edit.setText(value)
        finally:
            cancel_hang_trace()
            LOGGER.info("Qt file chooser closed")

    def _choose_dir(self, edit: QLineEdit) -> None:
        LOGGER.info("opening Qt directory chooser")
        arm_hang_trace()
        try:
            value = QFileDialog.getExistingDirectory(
                self, "选择目录", edit.text(),
                options=QFileDialog.Option.ShowDirsOnly | QFileDialog.Option.DontUseNativeDialog,
            )
            if value:
                edit.setText(value)
        finally:
            cancel_hang_trace()
            LOGGER.info("Qt directory chooser closed")

    def _choose_project(self) -> None:
        self._choose_file(self.project_path, "Project JSON (*.json)")

    def open_project(self) -> None:
        self._choose_project()
        if not self.project_path.text():
            return
        selected = self.project_path.text()
        self._run_async(
            lambda progress: self._load_project_task(selected, progress),
            self._project_opened,
            "正在读取项目 JSON…",
        )

    def _load_project_task(self, selected: str, progress: Callable[[str, int], None]) -> tuple[dict[str, Any], Path, Path]:
        progress("正在读取项目 JSON…", 20)
        result = self.service.load_project(selected)
        progress(f"项目 JSON 已读取：{len(result[0].get('rows') or [])} 行", 95)
        return result

    def _project_opened(self, result: tuple[dict[str, Any], Path, Path]) -> None:
        project, directory, _ = result
        self.project_name.setText(project.get("title") or directory.name)
        self.update_mode.setCurrentIndex(self.update_mode.findData("mapping"))
        self.mapping_mode.setCurrentIndex(max(0, self.mapping_mode.findData(project.get("mappingMode", "sequence"))))
        self.views.setText(",".join(project.get("mappingViews") or []))
        fields = project.get("mappingFields") or {}
        self.photo_ear_mode.setChecked(bool(fields.get("photoEarMode")))
        self.single_ear.setChecked(bool(fields.get("singleEarMode")))
        self.include_bare.setChecked(bool(fields.get("includeBareEarPhotos")))
        self.device_order = [str(value) for value in fields.get("deviceOrder") or []]
        self.extra_photo_assignments = [dict(value) for value in fields.get("extraPhotoAssignments") or [] if isinstance(value, dict)]
        self.status.setText(f"已打开：{project.get('title') or directory.name}；点击“读取并预览”加载映射")

    def reset(self) -> None:
        self.prepared = None
        for edit in (self.project_name, self.project_path, self.csv_path, self.photo_root, self.output_root):
            edit.clear()
        self.update_mode.setCurrentIndex(0)
        self.csv_model.replace([], [])
        self.roles_table.setRowCount(0)
        self.user_model.replace([])
        self.unused_model.replace([])
        self.device_order_model.replace([])
        self.device_order = []
        self.extra_photo_assignments = []
        self.unused_entries = []
        self.publish_summary.clear()
        self.status.setText("新项目")

    def _request(self) -> BuildRequest:
        views = [item.strip() for item in self.views.text().replace("，", ",").split(",") if item.strip()]
        fields: dict[str, Any] = {}
        if self.user_field.currentData() is not None:
            fields["userField"] = self.user_field.currentData()
            fields["earField"] = self.ear_field.currentData()
            fields["deviceField"] = self.device_field.currentData()
        fields["deviceOrder"] = list(self.device_order)
        fields["extraPhotoAssignments"] = [dict(value) for value in self.extra_photo_assignments]
        roles = {field: combo.currentData() for field, combo in self.role_combos.items()}
        current_mapping_overrides = mapping_overrides(self.prepared.mapping, stable=True) if self.prepared else {}
        return BuildRequest(
            update_mode=str(self.update_mode.currentData()), project_name=self.project_name.text().strip(),
            project_path=self.project_path.text().strip(), csv_path=self.csv_path.text().strip(),
            photo_root=self.photo_root.text().strip(), output_root=self.output_root.text().strip(),
            mapping_mode=str(self.mapping_mode.currentData()), mapping_fields=fields, mapping_views=views,
            field_role_overrides=roles, photo_mapping_overrides=current_mapping_overrides,
            photo_ear_mode=self.photo_ear_mode.isChecked(),
            single_ear_mode=self.single_ear.isChecked(), include_bare_ear_photos=self.include_bare.isChecked(),
            bare_ear_config={"enabled": self.include_bare.isChecked(), "splitByEar": self.split_bare.isChecked(), "genericCount": 1, "leftCount": 1, "rightCount": 1},
            strict=self.strict.isChecked(),
        )

    def preview(self) -> None:
        request = self._request()
        self._run_async(lambda progress: self.service.prepare(request, progress), self._preview_ready, "正在读取 CSV、索引照片并生成映射…")

    def _preview_ready(self, prepared: BuildResult) -> None:
        LOGGER.info(
            "preview rendering started rows=%s columns=%s photos=%s slots=%s",
            len(prepared.rows), len(prepared.headers), len(prepared.photos), len(prepared.mapping.slots),
        )
        self.prepared = prepared
        self.project_name.setText(prepared.project["title"])
        mapping_fields = prepared.project.get("mappingFields") or {}
        devices = list(dict.fromkeys(
            str(row.get(mapping_fields.get("deviceField"), ""))
            for row in prepared.rows
            if mapping_fields.get("deviceField") and row.get(mapping_fields.get("deviceField"))
        ))
        stored_order = [str(value) for value in mapping_fields.get("deviceOrder") or [] if str(value) in devices]
        self.device_order = stored_order + [value for value in devices if value not in stored_order]
        self.extra_photo_assignments = [dict(value) for value in mapping_fields.get("extraPhotoAssignments") or [] if isinstance(value, dict)]
        self._fill_csv(prepared)
        LOGGER.info("preview CSV and role tables rendered")
        self._fill_fields(prepared)
        LOGGER.info("preview mapping field controls rendered")
        self._fill_users(prepared)
        LOGGER.info("preview user and initial photo cards rendered")
        self.publish_summary.setPlainText(json.dumps({"更新模式": MODE_LABELS[prepared.request.update_mode], "差异": prepared.diff, "映射问题": len(prepared.mapping.audit), "未使用照片": len(prepared.mapping.unused_photos), "目标": str(prepared.target)}, ensure_ascii=False, indent=2))
        self.status.setText(f"预览完成：{len(prepared.rows)} 行 · {len(prepared.photos)} 张照片 · {len(prepared.mapping.audit)} 个检查项")
        LOGGER.info("preview rendering completed")

    def _fill_csv(self, prepared: BuildResult) -> None:
        self.roles_table.setUpdatesEnabled(False)
        self.csv_model.replace(prepared.headers, prepared.rows)
        LOGGER.info("preview CSV model attached rows=%s columns=%s", min(200, len(prepared.rows)), len(prepared.headers))
        self.roles_table.setRowCount(len(prepared.headers))
        self.role_combos.clear()
        self.auto_roles = {header: prepared.auto_field_roles.get(header, "dimension") for header in prepared.headers}
        for index, header in enumerate(prepared.headers):
            auto = self.auto_roles[header]
            final = prepared.field_roles.get(header, auto)
            self.roles_table.setItem(index, 0, QTableWidgetItem(header))
            self.roles_table.setItem(index, 1, QTableWidgetItem(FIELD_ROLE_LABELS.get(auto, auto)))
            combo = QComboBox()
            for value, label in FIELD_ROLE_LABELS.items():
                combo.addItem(label, value)
            combo.setCurrentIndex(combo.findData(final))
            combo.currentIndexChanged.connect(lambda _index, field=header, selector=combo: self._role_changed(field, selector))
            self.roles_table.setCellWidget(index, 2, combo)
            self.role_combos[header] = combo
        self.roles_table.setUpdatesEnabled(True)
        LOGGER.info("preview variable role controls rendered fields=%s", len(prepared.headers))

    def restore_auto_roles(self) -> None:
        if not self.prepared:
            return
        for field, combo in self.role_combos.items():
            combo.setCurrentIndex(combo.findData(self.auto_roles.get(field, "dimension")))

    def _role_changed(self, field: str, combo: QComboBox) -> None:
        if not self.prepared:
            return
        role = str(combo.currentData() or "dimension")
        self.prepared.field_roles[field] = role
        self.prepared.project.setdefault("dashboardConfig", {}).setdefault("fieldRoleOverrides", {})[field] = role
        self.status.setText(f"变量类别已暂存：{field} → {FIELD_ROLE_LABELS.get(role, role)}；点击“发布项目”后写入 JSON")

    def _fill_fields(self, prepared: BuildResult) -> None:
        values = prepared.headers
        current = prepared.project["mappingFields"]
        for combo, key, allow_empty in ((self.user_field, "userField", False), (self.ear_field, "earField", True), (self.device_field, "deviceField", True)):
            combo.blockSignals(True)
            combo.clear()
            if allow_empty:
                combo.addItem("— 无 —", None)
            for value in values:
                combo.addItem(value, value)
            selected = combo.findData(current.get(key) or None)
            combo.setCurrentIndex(max(0, selected))
            combo.blockSignals(False)

    def _fill_users(self, prepared: BuildResult) -> None:
        LOGGER.info("rendering mapping lists slots=%s unused=%s", len(prepared.mapping.slots), len(prepared.mapping.unused_photos))
        user_missing: dict[str, int] = {}
        for _, slot in self._visible_slots(prepared):
            user = slot["user"]
            user_missing.setdefault(user, 0)
            if not slot["value"]:
                user_missing[user] += 1
        self.user_model.replace([
            f"{user}  {'缺失 ' + str(missing) if missing else '正常'}"
            for user, missing in user_missing.items()
        ])
        known_users = list(user_missing)
        self.unused_entries = []
        photo_by_path = {photo.relative_path: photo for photo in prepared.photos}
        for path in prepared.mapping.unused_photos:
            photo = photo_by_path.get(path)
            parts = path_parts(photo) if photo else []
            user = next((value for value in known_users if parts_include(parts, value)), "未识别用户")
            self.unused_entries.append((user, path))
        self.unused_entries.sort(key=lambda item: (item[0], item[1]))
        self.unused_model.replace([f"[{user}] {path}" for user, path in self.unused_entries])
        self.device_order_model.replace(self.device_order)
        sequence_enabled = prepared.mapping.mode == "sequence" and len(self.device_order) > 1
        self.device_order_list.setEnabled(sequence_enabled)
        self.device_up.setEnabled(sequence_enabled)
        self.device_down.setEnabled(sequence_enabled)
        LOGGER.info("mapping list models attached users=%s unused=%s devices=%s", self.user_model.rowCount(), self.unused_model.rowCount(), len(self.device_order))
        if self.user_model.rowCount():
            self.user_list.setCurrentIndex(self.user_model.index(0, 0))

    def _current_user(self) -> str:
        current = self.user_list.currentIndex()
        text = str(self.user_model.data(current) or "") if current.isValid() else ""
        return text.split("  ", 1)[0]

    def _user_selection_changed(self, current: QModelIndex, previous: QModelIndex) -> None:
        self.render_user()

    def _unused_selection_changed(self, current: QModelIndex, previous: QModelIndex) -> None:
        self.extra_device.clear()
        self.extra_device.addItem("自动识别设备", "")
        if not self.prepared or not current.isValid() or current.row() >= len(self.unused_entries):
            return
        user, path = self.unused_entries[current.row()]
        fields = self.prepared.project.get("mappingFields") or {}
        device_field = str(fields.get("deviceField") or "")
        if not device_field or user == "未识别用户":
            return
        devices = list(dict.fromkeys(
            str(row.get(device_field, "")) for row in self.prepared.rows
            if str(row.get(fields.get("userField"), "")) == user and row.get(device_field)
        ))
        photo = next((item for item in self.prepared.photos if item.relative_path == path), None)
        parts = path_parts(photo) if photo else []
        inferred = next((device for device in devices if parts_include(parts, device)), "")
        for device in devices:
            self.extra_device.addItem(device, device)
        if inferred:
            self.extra_device.setCurrentIndex(self.extra_device.findData(inferred))

    def _visible_slots(self, prepared: BuildResult) -> list[tuple[int, dict[str, Any]]]:
        indexed = list(enumerate(prepared.mapping.slots))
        if prepared.mapping.mode != "folders":
            return indexed
        seen: set[tuple[str, str]] = set()
        visible: list[tuple[int, dict[str, Any]]] = []
        for index, slot in indexed:
            key = (str(slot["stableKey"]), str(slot["field"]))
            if key in seen:
                continue
            seen.add(key)
            visible.append((index, slot))
        return visible

    def render_user(self) -> None:
        while self.cards_layout.count():
            item = self.cards_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self.selected_slots.clear()
        if not self.prepared:
            return
        user = self._current_user()
        LOGGER.info("indexing photo card candidates user=%s photos=%s", user, len(self.prepared.photos))
        candidates = [
            photo.relative_path
            for photo in self.prepared.photos
            if parts_include(path_parts(photo), user)
        ]
        photo_by_value = {photo.relative_path: photo for photo in self.prepared.photos}
        slots = [(index, slot) for index, slot in self._visible_slots(self.prepared) if slot["user"] == user]
        LOGGER.info("rendering user photo cards slots=%s candidates=%s", len(slots), len(candidates))
        missing_thumbnails = []
        photo_root = self.photo_root_for_prepared() if self.prepared.photos else Path(".")
        for position, (index, slot) in enumerate(slots):
            photo = photo_by_value.get(slot["value"])
            thumb = self.service.index.cached_thumbnail(photo_root, photo) if photo else None
            if photo and not thumb and self.service.index.thumbnail_pending(photo_root, photo):
                missing_thumbnails.append(photo)
            card = PhotoCard(index, slot, candidates, str(thumb or ""), photo.absolute_path if photo else "")
            card.changed.connect(self.change_slot)
            card.selected.connect(self.select_slot)
            self.cards_layout.addWidget(card, position // 4, position % 4)
        self.cards_layout.setRowStretch((len(slots) + 3) // 4, 1)
        if missing_thumbnails and user not in self._thumbnail_jobs:
            self._thumbnail_jobs.add(user)
            unique = list({photo.relative_path: photo for photo in missing_thumbnails}.values())
            self._run_async(
                lambda progress: [self.service.index.thumbnail(photo_root, photo) for photo in unique],
                lambda _result, expected=user: self._thumbnails_ready(expected),
                f"正在为 {user} 生成 {len(unique)} 张缩略图…",
            )

    def _thumbnails_ready(self, user: str) -> None:
        self._thumbnail_jobs.discard(user)
        self.status.setText(f"{user} 缩略图已就绪")
        if self._current_user() == user:
            self.render_user()

    def photo_root_for_prepared(self) -> Path:
        assert self.prepared
        if self.prepared.request.update_mode in {"new", "photos", "all"}:
            return Path(self.prepared.request.photo_root)
        return Path(self.prepared.photos[0].absolute_path).parents[len(Path(self.prepared.photos[0].relative_path).parts) - 1]

    def change_slot(self, index: int, value: str) -> None:
        if not self.prepared:
            return
        set_slot(self.prepared.mapping, index, value)
        self.prepared.project["rows"] = self.prepared.mapping.rows
        self.prepared.project["photoMappingOverrides"] = mapping_overrides(self.prepared.mapping)
        self.render_user()

    def select_slot(self, index: int, checked: bool) -> None:
        if checked:
            self.selected_slots.add(index)
        else:
            self.selected_slots.discard(index)

    def swap_selected(self) -> None:
        if not self.prepared or len(self.selected_slots) != 2:
            QMessageBox.information(self, "交换照片", "请勾选两个照片槽位。")
            return
        swap_slots(self.prepared.mapping, *sorted(self.selected_slots))
        self._mapping_changed()

    def move_device_order(self, direction: int) -> None:
        if not self.prepared or self.prepared.mapping.mode != "sequence":
            return
        current = self.device_order_list.currentIndex().row()
        target = current + direction
        if current < 0 or target < 0 or target >= len(self.device_order):
            return
        old_order = list(self.device_order)
        new_order = list(old_order)
        new_order[current], new_order[target] = new_order[target], new_order[current]
        reorder_device_groups(self.prepared.mapping, old_order, new_order)
        self.device_order = new_order
        self.prepared.project["mappingFields"]["deviceOrder"] = list(new_order)
        self.device_order_model.replace(new_order)
        self.device_order_list.setCurrentIndex(self.device_order_model.index(target, 0))
        self._mapping_changed()

    def swap_ears(self) -> None:
        if not self.prepared:
            return
        user = self._current_user()
        swap_ear_groups(self.prepared.mapping, user)
        self._mapping_changed()

    def swap_all_ears(self) -> None:
        if not self.prepared:
            return
        swap_ear_groups(self.prepared.mapping, None)
        self._mapping_changed()

    def promote_unused_photo(self) -> None:
        if not self.prepared:
            return
        index = self.unused_list.currentIndex().row()
        if index < 0 or index >= len(self.unused_entries):
            QMessageBox.information(self, "处理未使用照片", "请先选择一张未使用或补拍照片。")
            return
        user, path = self.unused_entries[index]
        if user == "未识别用户":
            QMessageBox.information(self, "处理未使用照片", "无法从目录识别用户，请先把照片放入对应用户目录。")
            return
        fields = self.prepared.project.get("mappingFields") or {}
        config = MappingConfig(
            mode=self.prepared.mapping.mode,
            user_field=str(fields.get("userField") or ""),
            ear_field=str(fields.get("earField") or ""),
            device_field=str(fields.get("deviceField") or ""),
            views=list(self.prepared.project.get("mappingViews") or []),
            extra_assignments=[dict(value) for value in self.extra_photo_assignments],
        )
        try:
            assignment = make_extra_photo_assignment(
                self.prepared.mapping, self.prepared.photos, config, path, user, self.extra_view_name.text(), str(self.extra_device.currentData() or "")
            )
        except ValueError as error:
            QMessageBox.information(self, "处理未使用照片", str(error))
            return
        self.extra_photo_assignments.append(assignment)
        self.extra_view_name.clear()
        LOGGER.info("promoting unused photo user=%s device=%s view=%s path=%s", assignment["user"], assignment["device"], assignment["view"], assignment["path"])
        self.preview()

    def restore_user(self) -> None:
        if self.prepared:
            restore_slots(self.prepared.mapping, self._current_user())
            self._mapping_changed()

    def restore_all(self) -> None:
        if self.prepared:
            restore_slots(self.prepared.mapping)
            self._mapping_changed()

    def _mapping_changed(self) -> None:
        assert self.prepared
        self.prepared.project["rows"] = self.prepared.mapping.rows
        self.prepared.project["photoMappingOverrides"] = mapping_overrides(self.prepared.mapping)
        self.render_user()

    def publish(self) -> None:
        request = self._request()
        self._run_async(lambda progress: self.service.prepare(request, progress), self._confirm_publish, "正在重新计算发布候选版本…")

    def _confirm_publish(self, prepared: BuildResult) -> None:
        details = json.dumps(prepared.diff, ensure_ascii=False, indent=2)
        answer = QMessageBox.question(self, "确认发布范围", f"模式：{MODE_LABELS[prepared.request.update_mode]}\n映射问题：{len(prepared.mapping.audit)}\n目标：{prepared.target}\n\n差异摘要：\n{details}\n\n确认发布？")
        if answer != QMessageBox.Yes:
            self.status.setText("已取消发布，原项目未改变")
            return
        self._run_async(lambda progress: self.service.publish(prepared), self._published, "正在原子发布项目…")

    def _published(self, result: BuildResult) -> None:
        self.prepared = result
        self.status.setText(f"发布完成：{result.output_path}")
        QMessageBox.information(self, "发布完成", f"项目已写入：\n{result.output_path}")

    def open_log_folder(self) -> None:
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.log_path.parent)))

    def _set_progress(self, message: str, percent: int) -> None:
        self.status.setText(message)
        self.progress.setValue(max(0, min(100, percent)))
        self.progress.show()

    def _task_failed(self, message: str) -> None:
        self.progress.hide()
        self.status.setText(f"失败：{message}")
        QMessageBox.critical(self, "操作失败", f"{message}\n\n运行日志：\n{self.log_path}")

    def _task_completed(self, result: Any, on_success: Callable[[Any], None]) -> None:
        self._set_progress("正在构建预览界面…", 98)
        LOGGER.info("dispatching completed task on_main_thread=%s", QThread.currentThread() == self.thread())
        hang_path = arm_hang_trace()
        if hang_path:
            LOGGER.info("UI hang watchdog armed path=%s", hang_path)
        try:
            on_success(result)
        except Exception as error:
            LOGGER.exception("result rendering failed")
            self._task_failed(str(error))
        else:
            self.progress.hide()
        finally:
            cancel_hang_trace()

    def _run_async(self, callback: Callable[[Callable[[str, int], None]], Any], on_success: Callable[[Any], None], status: str) -> None:
        self.status.setText(status)
        self.progress.setValue(0)
        self.progress.show()
        LOGGER.info("task started status=%s", status)
        thread = QThread(self)
        worker = Worker(callback, on_success)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.progress.connect(self._set_progress, Qt.ConnectionType.QueuedConnection)
        worker.completed.connect(self._task_completed, Qt.ConnectionType.QueuedConnection)
        worker.failed.connect(self._task_failed, Qt.ConnectionType.QueuedConnection)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(self._thread_finished, Qt.ConnectionType.QueuedConnection)
        thread.finished.connect(thread.deleteLater)
        self._threads.append(thread)
        self._workers.append(worker)
        self._worker_by_thread[thread] = worker
        thread.start()


def run_gui() -> int:
    app = QApplication.instance() or QApplication(sys.argv)
    app.setApplicationName("Earphone Project Builder")
    window = MainWindow()
    window.show()
    return app.exec()
