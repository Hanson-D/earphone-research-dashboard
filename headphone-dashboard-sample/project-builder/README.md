# 耳机研究项目制作器 MVP

这是与分析看板并列的独立项目生产入口。它不会删除或关闭看板原有的 CSV/照片读取、变量类别更换、照片映射和人工调整功能；两条入口生成并继续编辑同一种项目 JSON v1。

正式实现由 Python 领域核心、PySide6 原生桌面 GUI、SQLite 照片索引和 Linux headless CLI 组成。`cli.js`、`project-builder.js` 与 `ui/` 仅保留为上一版 Web 原型和映射对照，不再作为默认入口。

## MVP 能力

- 新建项目、打开已有项目。
- UTF-8、UTF-8 BOM、GB18030 CSV 读取和原表预览。
- 自动变量分类，以及在 GUI 中通过下拉更换、确认和恢复自动类别。
- 顺序映射、任意层级文件夹映射、左右耳、单耳、照片分耳侧和空耳。
- 真实缩略图检查、点击原图、单槽位替换/清空、两槽位交换、设备组移动、左右耳互换、恢复自动映射。
- 新建、仅更新 CSV、仅更新照片、CSV + 照片、仅更新映射五种模式。
- MVP 照片更新采用安全合并，不自动删除已有照片。
- 发布前差异摘要、同盘暂存、候选包校验和原子替换。
- Linux CLI 的 dry-run、strict 和 JSON 输出。

## 从源码运行

需要 Python 3.11。

```bash
cd headphone-dashboard-sample/project-builder
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-runtime.txt
python native_entry.py
```

Linux 只运行 CLI 时不需要 X Server；PySide6 只有打开 GUI 时才导入。

```bash
PYTHONPATH=. python3 native_entry.py build \
  --update-mode new \
  --csv ./input/study.csv \
  --photos ./input/photos \
  --output ./projects \
  --project-name ANC_Study_01 \
  --mapping-mode sequence \
  --views 正面,侧面,后侧 \
  --dry-run --strict --json
```

更新已有项目时选择明确模式：

```bash
# 仅替换 CSV；不会扫描外部照片目录，也不会删除已有照片
PYTHONPATH=. python3 native_entry.py build \
  --update-mode csv --project ../projects/ANC_Study_01/ANC_Study_01.json \
  --csv ./input/study-v2.csv --mapping-mode sequence --views 正面,侧面,后侧

# 仅更新照片；保留项目原始 CSV 和分析配置
PYTHONPATH=. python3 native_entry.py build \
  --update-mode photos --project ../projects/ANC_Study_01/ANC_Study_01.json \
  --photos ./input/photos-v2 --mapping-mode folders
```

配置文件键与 `BuildRequest` 一致，支持 `update_mode`、`project_path`、`csv_path`、`photo_root`、`output_root`、`mapping_mode`、`mapping_fields`、`mapping_views`、`field_role_overrides` 等。相对路径以配置文件所在目录为基准。

退出码：`0` 成功；`1` 输入或系统错误；`2` strict 模式下的数据/映射问题。

## 测试

Python 领域核心不要求安装 PySide6：

```bash
PYTHONPATH=project-builder python3 -m unittest discover -s project-builder/tests -v
```

旧 JS 对照与看板回归：

```bash
node --test project-builder/project-builder.test.js project-builder/gui-server.test.js dashboard-core.test.js dashboard-ui.test.js
```

## Windows 本地 EXE 构建

Windows EXE 必须在本地 Windows 10/11 x64 机器构建，不使用 GitHub Actions 或其他云端 CI 代打包。正式产物是可靠性更高的 `onedir`：

```text
project-builder\build-windows-exe.bat
```

脚本会创建 `.venv-build`、安装固定版本依赖、运行 Python 测试、执行 PyInstaller、用 `--help` 冒烟测试，并输出文件大小与 SHA-256。

产物：

```text
project-builder\dist\EarphoneProjectBuilder\EarphoneProjectBuilder.exe
```

本仓库只提交源码和可复现的本地构建脚本。只有本地 Windows 验证通过后，才把整个 `EarphoneProjectBuilder` 目录压缩并按授权上传至 GitHub Release；CI artifact 不作为交付物。

## 项目输出

```text
projects/<项目名>/
├── <项目名>.json
├── data/<source>.csv
├── photos/<原相对目录>
└── exports/
    ├── photo_mapping_audit.csv
    └── publish_summary.json
```

更新项目时，程序先在目标同盘生成完整候选目录，通过 JSON、CSV 与照片引用检查后才替换正式目录。旧项目以带时间戳的 `backup-*` 目录保留，失败时自动恢复。

Windows 人工验收步骤见 [`../docs/project-builder-mvp-windows-acceptance.md`](../docs/project-builder-mvp-windows-acceptance.md)。
