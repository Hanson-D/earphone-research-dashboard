import json
import os
import shutil
import tarfile
from dataclasses import dataclass
from pathlib import Path


APP_NAME = "EarphoneDashboardAdmin"
DEFAULT_REMOTE_APP_ROOT = "/home/earphone/kanban/app"


@dataclass(frozen=True)
class Operation:
    key: str
    category: str
    title: str
    description: str
    command: str = ""
    interactive: bool = False
    confirm: str = ""
    kind: str = "command"


OPERATIONS = (
    Operation("upload", "部署", "上传程序", "打包本地程序并通过当前 SSH 连接上传；projects 和客户端密钥不会进入压缩包。", kind="upload", confirm="将覆盖服务器上同名程序文件，但不会删除服务器独有文件。继续吗？"),
    Operation("preflight", "部署", "部署前检查", "检查 Ubuntu、Python、OpenSSH、systemd、目录权限和端口状态。", "00-preflight.sh"),
    Operation("python", "部署", "准备 Python 环境", "从服务器现有 Conda 环境离线克隆看板运行时，并检查 Pillow。", "05-prepare-python-runtime.sh"),
    Operation("service-config", "部署", "配置看板服务", "创建 dashboard 服务账号、客户端权限配置和 systemd unit；不会启动服务。", "10-configure-dashboard-service.sh", interactive=True),
    Operation("initialize", "部署", "初始化数据目录", "以 dashboard 账号初始化 projects 缓存及写入权限。", "11-initialize-dashboard.sh"),
    Operation("self-check", "部署", "看板自检", "检查运行时、项目目录、外挂编码表和后端测试。", "12-dashboard-self-check.sh"),
    Operation("tunnel-config", "部署", "配置 SSH 隧道", "安装受限 SSH Match 配置并安全重载 sshd。", "20-configure-tunnel-access.sh", interactive=True, confirm="此操作会修改并验证 sshd 配置。继续吗？"),

    Operation("enable", "服务", "启用开机启动", "启用 earphone-dashboard systemd 服务。", "40-service-control.sh enable"),
    Operation("start", "服务", "启动服务", "启动看板并显示 systemd 状态。", "40-service-control.sh start"),
    Operation("stop", "服务", "停止服务", "停止看板服务。", "40-service-control.sh stop", confirm="确定停止看板服务吗？"),
    Operation("restart", "服务", "重启服务", "应用程序或配置更新后重启，并显示状态。", "40-service-control.sh restart"),
    Operation("status", "服务", "服务状态", "显示 systemd 状态和 7362 监听信息。", "40-service-control.sh status"),
    Operation("health", "服务", "健康检查", "从服务器本机验证看板 HTTP 入口。", "40-service-control.sh health"),
    Operation("logs", "服务", "实时日志", "持续跟踪 journal 日志；可用“停止当前任务”结束。", "40-service-control.sh logs", kind="stream"),

    Operation("client-add", "客户端", "添加并下载客户端", "创建受限 SSH 账号、密钥及项目权限，并把 Windows 客户端包下载到本机。", kind="add-client"),
    Operation("client-download", "客户端", "下载已有客户端包", "创建成功但下载中断时，从服务器导出目录重新下载，不重复创建账号。", kind="download-client"),
    Operation("client-list", "客户端", "查看客户端及权限", "列出客户端编号、SSH 用户、专属端口、项目编码和状态。", "31-list-clients.sh"),
    Operation("client-access", "客户端", "修改客户端权限", "按客户端编号修改管理员状态或可访问项目；自动热加载。", "50-manage-client-access.sh set-projects", interactive=True),
    Operation("client-migrate", "客户端", "迁移已有客户端", "保留已有密钥，为旧客户端分配专属端口和项目权限并刷新导出包。", "50-manage-client-access.sh migrate", interactive=True, confirm="迁移会修改旧客户端的 SSH 目标端口；Windows 端之后需要用刷新后的客户端包重新安装。继续吗？"),
    Operation("client-revoke", "客户端", "撤销客户端", "锁定指定隧道账号并撤销公钥，不删除项目。", "33-revoke-client.sh", interactive=True),
    Operation("client-delete-export", "客户端", "删除服务器导出副本", "确认 Windows 已安装后删除 /root 下的私钥导出副本。", "34-delete-client-export.sh", interactive=True),

    Operation("project-sync", "项目编码", "同步项目编码", "扫描 projects，为新增项目分配 P0001 格式编码并识别路径移动。", "51-manage-dashboard-projects.sh sync"),
    Operation("project-list", "项目编码", "查看项目编码", "列出编码、状态、项目 title 和相对 JSON 路径。", "51-manage-dashboard-projects.sh list"),
    Operation("project-code", "项目编码", "修改项目编码", "修改外挂编码，并同步替换客户端授权中的旧编码。", "51-manage-dashboard-projects.sh set-code", interactive=True),
    Operation("project-relink", "项目编码", "重新关联路径", "同名项目无法自动匹配时，将编码关联到新的相对 JSON 路径。", "51-manage-dashboard-projects.sh relink", interactive=True),
)


def operations_by_category():
    grouped = {}
    for operation in OPERATIONS:
        grouped.setdefault(operation.category, []).append(operation)
    return grouped


def settings_dir():
    base = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / APP_NAME


def settings_path():
    return settings_dir() / "settings.json"


def load_settings(path=None):
    target = Path(path) if path else settings_path()
    defaults = {
        "host": "",
        "port": "22",
        "user": "root",
        "remoteAppRoot": DEFAULT_REMOTE_APP_ROOT,
        "localAppRoot": "",
        "downloadRoot": str(Path.home() / "Downloads" / "EarphoneDashboardClients"),
    }
    if not target.is_file():
        return defaults
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return defaults
    if isinstance(payload, dict):
        for key in defaults:
            if key in payload and isinstance(payload[key], str):
                defaults[key] = payload[key]
    return defaults


def save_settings(payload, path=None):
    target = Path(path) if path else settings_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    clean = {
        key: str(payload.get(key, ""))
        for key in ("host", "port", "user", "remoteAppRoot", "localAppRoot", "downloadRoot")
    }
    target.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def discover_app_root(start):
    path = Path(start).resolve()
    if path.is_file():
        path = path.parent
    for candidate in (path, *path.parents):
        if (candidate / "server" / "server.py").is_file() and (candidate / "deployment" / "linux" / "root").is_dir():
            return candidate
    return None


def excluded_upload_path(relative_path):
    path = Path(relative_path)
    parts = set(path.parts)
    if parts & {".git", "projects", ".cache", ".pycache", "__pycache__", "downloads", "build", "dist", ".build-venv"}:
        return True
    if path.name in {".DS_Store", ".admin-connection.bat"}:
        return True
    return path.suffix.lower() == ".pyc"


def build_upload_archive(app_root, target_path, progress=None):
    app_root = Path(app_root).resolve()
    target_path = Path(target_path)
    if not (app_root / "server" / "server.py").is_file():
        raise ValueError("所选目录不是有效的看板程序根目录。")
    files = []
    for path in app_root.rglob("*"):
        relative = path.relative_to(app_root)
        if excluded_upload_path(relative) or path.is_symlink() or not path.is_file():
            continue
        files.append((path, relative))
    total = len(files)
    with tarfile.open(str(target_path), "w") as archive:
        for index, (path, relative) in enumerate(files, 1):
            archive.add(str(path), arcname=relative.as_posix(), recursive=False)
            if progress:
                progress(index, total, relative.as_posix())
    return {"files": total, "bytes": target_path.stat().st_size}


def remote_script_command(remote_app_root, command):
    import shlex
    scripts = str(remote_app_root).rstrip("/") + "/deployment/linux/root"
    parts = command.split(" ", 1)
    script = scripts + "/" + parts[0]
    suffix = " " + parts[1] if len(parts) == 2 else ""
    return "bash {}{}".format(shlex.quote(script), suffix)


def prepare_simple_client_package(package_root, launcher_path):
    package_root = Path(package_root)
    launcher_path = Path(launcher_path)
    bundle_path = package_root / "client.bundle"
    if not bundle_path.is_file():
        raise ValueError("下载内容缺少 client.bundle。请先上传并使用新版服务器脚本刷新客户端包。")
    if not launcher_path.is_file():
        raise ValueError("找不到 OpenKanban.exe。请使用包含客户端运行程序的新版管理工具。")
    if launcher_path.read_bytes()[:2] != b"MZ":
        raise ValueError("OpenKanban.exe 不是有效的 Windows 可执行文件。")
    try:
        payload = json.loads(bundle_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError("client.bundle 无效。") from error
    if payload.get("version") != 1 or not payload.get("clientId"):
        raise ValueError("client.bundle 版本无效。")
    for item in list(package_root.iterdir()):
        if item.name == "client.bundle":
            continue
        if item.is_dir():
            shutil.rmtree(str(item))
        else:
            item.unlink()
    shutil.copy2(str(launcher_path), str(package_root / "OpenKanban.exe"))
    (package_root / "README.txt").write_text(
        "Earphone Dashboard client: {}\n\n"
        "Double-click OpenKanban.exe. It installs or updates this Windows user's "
        "client configuration, starts the secure SSH tunnel, and opens the dashboard.\n\n"
        "Keep OpenKanban.exe and client.bundle together. Do not share this folder.\n".format(payload["clientId"]),
        encoding="utf-8",
    )
    return payload["clientId"]
