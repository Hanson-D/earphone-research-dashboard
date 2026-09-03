# 看板项目制作器

独立读取 CSV 和照片目录，生成现有耳机数据看板可直接加载的项目文件夹。核心映射逻辑直接复用 `dashboard-core.js`，Windows 和 Linux 使用相同源码。

## 环境

- Node.js 18 或更高版本
- 不依赖第三方 npm 包
- CSV 当前按 UTF-8（可带 BOM）读取

## 快速使用

### 图形界面

在安装了 Node.js 的电脑上，直接双击 `project-builder.bat`（Windows）或运行：

```bash
node project-builder/cli.js gui
```

程序会打开本地操作页面。依次选择 CSV、照片根目录和输出目录，先点“先检查”查看自动识别结果及异常清单，再点“生成项目”。页面和生成接口只监听本机环回地址，并使用每次启动随机生成的会话令牌。

Linux/macOS 可以直接使用启动脚本：

```bash
./project-builder/project-builder build --help
```

Windows 可使用：

```bat
project-builder\project-builder.bat build --help
```

文件夹模式会自动识别方向：

```bash
node project-builder/cli.js build \
  --csv ./input/study.csv \
  --photos ./input/photos \
  --output ./projects \
  --project-name ANC_Study_01 \
  --mode folders
```

拍摄顺序模式需要明确视角顺序：

```bash
node project-builder/cli.js build \
  --csv ./input/study.csv \
  --photos ./input/photos \
  --output ./projects \
  --mode sequence \
  --views 正面,侧面,后侧
```

反复执行同类项目时可使用配置文件：

```bash
node project-builder/cli.js build --config project-builder/project-builder.config.example.json
```

配置文件中的 CSV、照片和输出相对路径均以配置文件所在目录为基准，因此 systemd、cron 从其他工作目录启动时也不会改变输入输出位置。命令行直接传入的相对路径仍以当前工作目录为基准。

自动化流水线建议先验证，再生成：

```bash
node project-builder/cli.js build --config builder.json --dry-run --fail-on-issues --json
node project-builder/cli.js build --config builder.json --json
```

退出码：`0` 表示成功；`1` 表示参数、输入或文件错误；启用 `--fail-on-issues` 时，`2` 表示照片映射存在缺失或重复。

## 输出

```text
projects/
└── ANC_Study_01/
    ├── ANC_Study_01.json
    ├── data/
    │   └── study.csv
    ├── photos/
    │   └── ...原照片目录结构
    └── exports/
        ├── photo_mapping_audit.csv
        └── build-summary.json
```

默认不会覆盖已有项目目录。这样可以避免自动化任务误删人工修正过的项目；需要重建时请先移动或改名旧目录。

## Windows 和 Linux

当前 CLI 已可在 Windows、macOS 和 Linux 的 Node.js 环境运行。Windows `.exe` 和 Linux 独立二进制从同一个入口分别构建；Windows EXE 本身不能在 Linux 运行，但生成逻辑与项目格式完全相同。CI 会同时产出 Windows x64 和 Linux x64 两个 artifact。

### 构建 Windows EXE

在 Windows 上双击：

```text
build-windows-exe.bat
```

脚本固定使用 `@yao-pkg/pkg@6.22.0`，输出：

```text
dist/dashboard-project-builder.exe
```

双击 EXE 会打开图形界面；在命令行给它传入 `build ...` 参数时则作为自动化 CLI 使用。仓库也包含 `Build project builder` GitHub Actions 工作流，可在 Windows runner 上测试、构建并上传 EXE artifact。
