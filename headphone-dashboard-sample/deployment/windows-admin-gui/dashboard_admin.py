#!/usr/bin/env python3
import base64
import ctypes
import hashlib
import re
import shlex
import shutil
import stat
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

try:
    import paramiko
except ImportError:
    paramiko = None

from admin_core import (
    DEFAULT_REMOTE_APP_ROOT,
    build_upload_archive,
    discover_app_root,
    load_settings,
    operations_by_category,
    remote_script_command,
    save_settings,
    settings_dir,
    prepare_simple_client_package,
)


BG = "#0d1116"
PANEL = "#151b22"
PANEL_ALT = "#1b232c"
LINE = "#303a45"
TEXT = "#f1ede6"
MUTED = "#98a3ad"
ACCENT = "#b93b43"
ACCENT_HOVER = "#d04a53"
GOOD = "#5aae84"
WARN = "#d7a64a"
MONO = "Cascadia Mono"
DISPLAY = "Bahnschrift SemiBold"


class InteractiveHostKeyPolicy(paramiko.MissingHostKeyPolicy if paramiko else object):
    def __init__(self, confirm_callback, known_hosts_path):
        self.confirm_callback = confirm_callback
        self.known_hosts_path = Path(known_hosts_path)

    def missing_host_key(self, client, hostname, key):
        digest = hashlib.sha256(key.asbytes()).digest()
        fingerprint = "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")
        if not self.confirm_callback(hostname, key.get_name(), fingerprint):
            raise paramiko.SSHException("Server host key was not accepted.")
        client.get_host_keys().add(hostname, key.get_name(), key)
        self.known_hosts_path.parent.mkdir(parents=True, exist_ok=True)
        client.save_host_keys(str(self.known_hosts_path))


class AdminConnection:
    def __init__(self, host_key_callback):
        self.client = None
        self.host_key_callback = host_key_callback
        self.active_channel = None
        self.channel_lock = threading.Lock()

    @property
    def connected(self):
        transport = self.client.get_transport() if self.client else None
        return bool(transport and transport.is_active())

    def connect(self, host, port, username, password):
        if paramiko is None:
            raise RuntimeError("Paramiko is not installed. Build or run through build-admin-tool.bat.")
        self.close()
        client = paramiko.SSHClient()
        client.load_system_host_keys()
        known_hosts = settings_dir() / "known_hosts"
        if known_hosts.is_file():
            client.load_host_keys(str(known_hosts))
        client.set_missing_host_key_policy(InteractiveHostKeyPolicy(self.host_key_callback, known_hosts))
        try:
            client.connect(
                hostname=host,
                port=port,
                username=username,
                password=password,
                look_for_keys=False,
                allow_agent=False,
                timeout=15,
                auth_timeout=20,
                banner_timeout=20,
            )
        except Exception:
            client.close()
            raise
        transport = client.get_transport()
        if transport:
            transport.set_keepalive(30)
        self.client = client

    def execute(self, command, output_callback, interactive=False, stop_event=None):
        if not self.connected:
            raise RuntimeError("SSH connection is not active.")
        channel = self.client.get_transport().open_session(timeout=15)
        if interactive:
            channel.get_pty(term="xterm", width=160, height=48)
        channel.exec_command(command)
        with self.channel_lock:
            self.active_channel = channel
        try:
            while True:
                emitted = False
                if channel.recv_ready():
                    output_callback(channel.recv(32768).decode("utf-8", errors="replace"))
                    emitted = True
                if channel.recv_stderr_ready():
                    output_callback(channel.recv_stderr(32768).decode("utf-8", errors="replace"))
                    emitted = True
                if stop_event and stop_event.is_set():
                    channel.close()
                    return 130
                if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                    break
                if not emitted:
                    time.sleep(0.05)
            return channel.recv_exit_status()
        finally:
            with self.channel_lock:
                if self.active_channel is channel:
                    self.active_channel = None
            channel.close()

    def send(self, text):
        with self.channel_lock:
            channel = self.active_channel
        if not channel or channel.closed:
            raise RuntimeError("No interactive task is waiting for input.")
        channel.send(text)

    def stop_active(self):
        with self.channel_lock:
            channel = self.active_channel
        if channel and not channel.closed:
            channel.close()

    def sftp(self):
        if not self.connected:
            raise RuntimeError("SSH connection is not active.")
        return self.client.open_sftp()

    def close(self):
        self.stop_active()
        if self.client:
            self.client.close()
        self.client = None


class DashboardAdminApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Earphone Dashboard / Remote Admin")
        self.root.geometry("1220x820")
        self.root.minsize(980, 680)
        self.root.configure(bg=BG)
        self.settings = load_settings()
        self.connection = AdminConnection(self.confirm_host_key)
        self.busy = False
        self.stop_event = threading.Event()
        self.operation_buttons = []
        self.category = next(iter(operations_by_category()))
        self._build_styles()
        self._build_ui()
        self._load_defaults()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _build_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL)
        style.configure("Alt.TFrame", background=PANEL_ALT)
        style.configure("TLabel", background=BG, foreground=TEXT, font=("Microsoft YaHei UI", 10))
        style.configure("Muted.TLabel", background=BG, foreground=MUTED, font=("Microsoft YaHei UI", 9))
        style.configure("Panel.TLabel", background=PANEL, foreground=TEXT, font=("Microsoft YaHei UI", 10))
        style.configure("PanelMuted.TLabel", background=PANEL, foreground=MUTED, font=("Microsoft YaHei UI", 9))
        style.configure("Title.TLabel", background=BG, foreground=TEXT, font=(DISPLAY, 22))
        style.configure("Section.TLabel", background=BG, foreground=TEXT, font=(DISPLAY, 14))
        style.configure("TEntry", fieldbackground="#0f141a", foreground=TEXT, insertcolor=TEXT, bordercolor=LINE, padding=7)
        style.configure("Accent.TButton", background=ACCENT, foreground="white", borderwidth=0, padding=(16, 9), font=(DISPLAY, 10))
        style.map("Accent.TButton", background=[("active", ACCENT_HOVER), ("disabled", "#49252a")])
        style.configure("Quiet.TButton", background=PANEL_ALT, foreground=TEXT, bordercolor=LINE, padding=(12, 8), font=("Microsoft YaHei UI", 9))
        style.map("Quiet.TButton", background=[("active", "#26313c"), ("disabled", PANEL)])
        style.configure("Rail.TButton", background=BG, foreground=MUTED, borderwidth=0, anchor="w", padding=(14, 11), font=(DISPLAY, 10))
        style.map("Rail.TButton", background=[("active", PANEL_ALT)], foreground=[("active", TEXT)])
        style.configure("SelectedRail.TButton", background=ACCENT, foreground="white", borderwidth=0, anchor="w", padding=(14, 11), font=(DISPLAY, 10))

    def _build_ui(self):
        self.root.grid_rowconfigure(1, weight=1)
        self.root.grid_columnconfigure(0, weight=1)

        header = ttk.Frame(self.root, padding=(24, 18, 24, 14))
        header.grid(row=0, column=0, sticky="ew")
        header.grid_columnconfigure(1, weight=1)
        brand = ttk.Frame(header)
        brand.grid(row=0, column=0, sticky="w")
        ttk.Label(brand, text="REMOTE OPERATIONS / 01", foreground=ACCENT, font=(MONO, 9)).pack(anchor="w")
        ttk.Label(brand, text="Earphone Dashboard Admin", style="Title.TLabel").pack(anchor="w")

        connection_bar = ttk.Frame(header)
        connection_bar.grid(row=0, column=1, sticky="e")
        self.host_var = tk.StringVar()
        self.port_var = tk.StringVar()
        self.user_var = tk.StringVar()
        for label, variable, width in (("SERVER", self.host_var, 20), ("PORT", self.port_var, 7), ("USER", self.user_var, 10)):
            group = ttk.Frame(connection_bar)
            group.pack(side="left", padx=(0, 8))
            ttk.Label(group, text=label, foreground=MUTED, font=(MONO, 8)).pack(anchor="w")
            ttk.Entry(group, textvariable=variable, width=width).pack()
        self.connect_button = ttk.Button(connection_bar, text="连接", style="Accent.TButton", command=self.toggle_connection)
        self.connect_button.pack(side="left", padx=(4, 0), pady=(15, 0))
        self.status_label = ttk.Label(connection_bar, text="●  未连接", foreground=MUTED, font=(DISPLAY, 9))
        self.status_label.pack(side="left", padx=(14, 0), pady=(15, 0))

        body = ttk.Frame(self.root, padding=(24, 0, 24, 22))
        body.grid(row=1, column=0, sticky="nsew")
        body.grid_rowconfigure(0, weight=3)
        body.grid_rowconfigure(1, weight=2)
        body.grid_columnconfigure(1, weight=1)

        rail = ttk.Frame(body, style="Panel.TFrame", padding=(10, 16))
        rail.grid(row=0, column=0, rowspan=2, sticky="nsw", padx=(0, 14))
        ttk.Label(rail, text="CONTROL SECTIONS", style="PanelMuted.TLabel", font=(MONO, 8)).pack(anchor="w", padx=8, pady=(0, 10))
        self.rail_buttons = {}
        for category in operations_by_category():
            button = ttk.Button(rail, text=category, style="Rail.TButton", command=lambda value=category: self.select_category(value), width=16)
            button.pack(fill="x", pady=2)
            self.rail_buttons[category] = button
        ttk.Separator(rail, orient="horizontal").pack(fill="x", pady=16)
        ttk.Button(rail, text="本地程序目录", style="Quiet.TButton", command=self.choose_app_root).pack(fill="x", pady=3)
        ttk.Button(rail, text="客户端下载目录", style="Quiet.TButton", command=self.choose_download_root).pack(fill="x", pady=3)

        workspace = ttk.Frame(body, style="Panel.TFrame", padding=(20, 18))
        workspace.grid(row=0, column=1, sticky="nsew")
        workspace.grid_rowconfigure(2, weight=1)
        workspace.grid_columnconfigure(0, weight=1)
        heading = ttk.Frame(workspace, style="Panel.TFrame")
        heading.grid(row=0, column=0, sticky="ew")
        self.category_label = ttk.Label(heading, text=self.category, background=PANEL, foreground=TEXT, font=(DISPLAY, 18))
        self.category_label.pack(side="left")
        self.task_status = ttk.Label(heading, text="READY", background=PANEL, foreground=GOOD, font=(MONO, 9))
        self.task_status.pack(side="right")
        self.location_label = ttk.Label(workspace, text="", style="PanelMuted.TLabel")
        self.location_label.grid(row=1, column=0, sticky="ew", pady=(4, 14))
        self.action_frame = ttk.Frame(workspace, style="Panel.TFrame")
        self.action_frame.grid(row=2, column=0, sticky="nsew")
        self.action_frame.grid_columnconfigure(0, weight=1)
        self.action_frame.grid_columnconfigure(1, weight=1)

        console = ttk.Frame(body, style="Alt.TFrame", padding=(14, 12))
        console.grid(row=1, column=1, sticky="nsew", pady=(14, 0))
        console.grid_rowconfigure(1, weight=1)
        console.grid_columnconfigure(0, weight=1)
        console_header = ttk.Frame(console, style="Alt.TFrame")
        console_header.grid(row=0, column=0, sticky="ew", pady=(0, 8))
        ttk.Label(console_header, text="REMOTE OUTPUT", background=PANEL_ALT, foreground=TEXT, font=(MONO, 9)).pack(side="left")
        ttk.Button(console_header, text="清空", style="Quiet.TButton", command=self.clear_log).pack(side="right")
        self.stop_button = ttk.Button(console_header, text="停止当前任务", style="Quiet.TButton", command=self.stop_task, state="disabled")
        self.stop_button.pack(side="right", padx=6)

        log_wrap = ttk.Frame(console, style="Alt.TFrame")
        log_wrap.grid(row=1, column=0, sticky="nsew")
        log_wrap.grid_rowconfigure(0, weight=1)
        log_wrap.grid_columnconfigure(0, weight=1)
        self.log = tk.Text(log_wrap, bg="#090d11", fg="#d8e0e7", insertbackground=TEXT, relief="flat", font=(MONO, 9), wrap="word", padx=12, pady=10, state="disabled")
        self.log.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(log_wrap, orient="vertical", command=self.log.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.log.configure(yscrollcommand=scrollbar.set)

        input_bar = ttk.Frame(console, style="Alt.TFrame")
        input_bar.grid(row=2, column=0, sticky="ew", pady=(8, 0))
        input_bar.grid_columnconfigure(0, weight=1)
        self.input_var = tk.StringVar()
        self.input_entry = ttk.Entry(input_bar, textvariable=self.input_var, state="disabled")
        self.input_entry.grid(row=0, column=0, sticky="ew")
        self.input_entry.bind("<Return>", lambda event: self.send_input())
        self.send_button = ttk.Button(input_bar, text="发送输入", style="Quiet.TButton", command=self.send_input, state="disabled")
        self.send_button.grid(row=0, column=1, padx=(8, 0))
        self.secret_button = ttk.Button(input_bar, text="发送密码", style="Quiet.TButton", command=self.send_secret, state="disabled")
        self.secret_button.grid(row=0, column=2, padx=(6, 0))

        self.select_category(self.category)

    def _load_defaults(self):
        self.host_var.set(self.settings["host"])
        self.port_var.set(self.settings["port"] or "22")
        self.user_var.set(self.settings["user"] or "root")
        if not self.settings.get("localAppRoot"):
            candidates = [Path.cwd(), Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__)]
            for candidate in candidates:
                discovered = discover_app_root(candidate)
                if discovered:
                    self.settings["localAppRoot"] = str(discovered)
                    break
        self.update_location_label()

    def update_location_label(self):
        local_root = self.settings.get("localAppRoot") or "未选择"
        remote_root = self.settings.get("remoteAppRoot") or DEFAULT_REMOTE_APP_ROOT
        self.location_label.configure(text="LOCAL  {}    →    REMOTE  {}".format(local_root, remote_root))

    def select_category(self, category):
        self.category = category
        self.category_label.configure(text=category)
        for name, button in self.rail_buttons.items():
            button.configure(style="SelectedRail.TButton" if name == category else "Rail.TButton")
        for child in self.action_frame.winfo_children():
            child.destroy()
        self.operation_buttons = []
        operations = operations_by_category()[category]
        for index, operation in enumerate(operations):
            card = ttk.Frame(self.action_frame, style="Alt.TFrame", padding=(14, 12))
            card.grid(row=index // 2, column=index % 2, sticky="nsew", padx=(0 if index % 2 == 0 else 6, 6 if index % 2 == 0 else 0), pady=5)
            card.grid_columnconfigure(0, weight=1)
            ttk.Label(card, text=operation.title, background=PANEL_ALT, foreground=TEXT, font=(DISPLAY, 11)).grid(row=0, column=0, sticky="w")
            ttk.Label(card, text=operation.description, background=PANEL_ALT, foreground=MUTED, font=("Microsoft YaHei UI", 8), wraplength=360, justify="left").grid(row=1, column=0, sticky="ew", pady=(4, 10))
            button = ttk.Button(card, text="运行", style="Quiet.TButton", command=lambda item=operation: self.run_operation(item))
            button.grid(row=2, column=0, sticky="w")
            self.operation_buttons.append(button)
        self.update_controls()

    def append_log(self, text):
        self.root.after(0, self._append_log_ui, text)

    def _append_log_ui(self, text):
        self.log.configure(state="normal")
        self.log.insert("end", text)
        self.log.see("end")
        self.log.configure(state="disabled")

    def clear_log(self):
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")

    def call_on_ui(self, callback):
        completed = threading.Event()
        result = {}
        def invoke():
            try:
                result["value"] = callback()
            finally:
                completed.set()
        self.root.after(0, invoke)
        completed.wait()
        return result.get("value")

    def confirm_host_key(self, hostname, key_type, fingerprint):
        return bool(self.call_on_ui(lambda: messagebox.askyesno(
            "确认服务器指纹",
            "首次连接到 {}。\n\n类型：{}\n指纹：{}\n\n请与服务器管理员确认后再接受。".format(hostname, key_type, fingerprint),
            parent=self.root,
        )))

    def toggle_connection(self):
        if self.connection.connected:
            self.connection.close()
            self.append_log("\n[local] SSH connection closed.\n")
            self.set_busy(False)
            self.update_connection_state()
            return
        host = self.host_var.get().strip()
        username = self.user_var.get().strip() or "root"
        try:
            port = int(self.port_var.get().strip() or "22")
            if not host or not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            messagebox.showerror("连接信息错误", "请填写服务器地址和有效 SSH 端口。", parent=self.root)
            return
        password = simpledialog.askstring("SSH 登录", "请输入 {}@{} 的密码：".format(username, host), show="*", parent=self.root)
        if password is None:
            return
        self.settings.update({"host": host, "port": str(port), "user": username})
        save_settings(self.settings)
        self.set_busy(True, "CONNECTING")
        self.append_log("\n[local] Connecting to {}:{} as {}...\n".format(host, port, username))

        def worker(secret):
            try:
                self.connection.connect(host, port, username, secret)
                self.append_log("[local] SSH connection established. Password was not saved.\n")
            except Exception as error:
                self.append_log("[error] {}\n".format(error))
                self.call_on_ui(lambda: messagebox.showerror("SSH 连接失败", str(error), parent=self.root))
            finally:
                secret = None
                self.root.after(0, lambda: (self.set_busy(False), self.update_connection_state()))
        threading.Thread(target=worker, args=(password,), daemon=True).start()
        password = None

    def update_connection_state(self):
        if self.connection.connected:
            self.status_label.configure(text="●  已连接", foreground=GOOD)
            self.connect_button.configure(text="断开")
        else:
            self.status_label.configure(text="●  未连接", foreground=MUTED)
            self.connect_button.configure(text="连接")
        self.update_controls()

    def set_busy(self, value, status=None, interactive=False):
        self.busy = value
        self.task_status.configure(text=status or ("RUNNING" if value else "READY"), foreground=WARN if value else GOOD)
        self.stop_button.configure(state="normal" if value else "disabled")
        state = "normal" if value and interactive else "disabled"
        self.input_entry.configure(state=state)
        self.send_button.configure(state=state)
        self.secret_button.configure(state=state)
        self.update_controls()

    def finish_task(self):
        self.set_busy(False)
        self.update_connection_state()

    def update_controls(self):
        enabled = self.connection.connected and not self.busy
        for button in self.operation_buttons:
            button.configure(state="normal" if enabled else "disabled")
        self.connect_button.configure(state="disabled" if self.busy else "normal")

    def choose_app_root(self):
        selected = filedialog.askdirectory(title="选择看板程序根目录", initialdir=self.settings.get("localAppRoot") or str(Path.cwd()))
        if selected:
            if not discover_app_root(selected) or not (Path(selected) / "server" / "server.py").is_file():
                messagebox.showerror("目录不正确", "请选择直接包含 server 和 deployment 的看板程序目录。", parent=self.root)
                return
            self.settings["localAppRoot"] = selected
            save_settings(self.settings)
            self.update_location_label()

    def choose_download_root(self):
        selected = filedialog.askdirectory(title="选择客户端包下载目录", initialdir=self.settings.get("downloadRoot") or str(Path.home()))
        if selected:
            self.settings["downloadRoot"] = selected
            save_settings(self.settings)

    def run_operation(self, operation):
        if not self.connection.connected:
            messagebox.showwarning("尚未连接", "请先连接 Linux 服务器。", parent=self.root)
            return
        if operation.confirm and not messagebox.askyesno("确认操作", operation.confirm, parent=self.root):
            return
        if operation.kind == "upload":
            self.run_upload(operation)
        elif operation.kind == "add-client":
            self.run_add_client(operation)
        elif operation.kind == "download-client":
            self.run_download_client()
        else:
            self.run_remote_operation(operation)

    def run_remote_operation(self, operation):
        command = remote_script_command(self.settings.get("remoteAppRoot") or DEFAULT_REMOTE_APP_ROOT, operation.command)
        self.stop_event.clear()
        self.set_busy(True, "STREAMING" if operation.kind == "stream" else "RUNNING", operation.interactive)
        self.append_log("\n$ {}\n".format(command))

        def worker():
            try:
                code = self.connection.execute(command, self.append_log, interactive=operation.interactive or operation.kind == "stream", stop_event=self.stop_event)
                self.append_log("\n[remote] Exit code {}.\n".format(code))
            except Exception as error:
                self.append_log("\n[error] {}\n".format(error))
            finally:
                self.root.after(0, self.finish_task)
        threading.Thread(target=worker, daemon=True).start()

    def run_upload(self, operation):
        app_root = Path(self.settings.get("localAppRoot") or "")
        if not (app_root / "server" / "server.py").is_file():
            messagebox.showerror("缺少程序目录", "请先通过左侧按钮选择看板程序根目录。", parent=self.root)
            return
        self.stop_event.clear()
        self.set_busy(True, "PACKING")
        self.append_log("\n[local] Building upload archive from {}\n".format(app_root))

        def worker():
            local_archive = Path(tempfile.gettempdir()) / "earphone-dashboard-{}.tar".format(uuid.uuid4().hex)
            remote_archive = "/tmp/earphone-dashboard-{}.tar".format(uuid.uuid4().hex)
            try:
                result = build_upload_archive(app_root, local_archive)
                self.append_log("[local] Packed {} files ({:.1f} MiB).\n".format(result["files"], result["bytes"] / 1048576))
                with self.connection.sftp() as sftp:
                    size = max(1, local_archive.stat().st_size)
                    last_percent = [-1]
                    def progress(sent, total):
                        percent = int(sent * 100 / max(total, size))
                        if percent >= last_percent[0] + 10 or percent == 100:
                            last_percent[0] = percent
                            self.append_log("[upload] {}%\n".format(percent))
                    sftp.put(str(local_archive), remote_archive, callback=progress)
                remote_root = self.settings.get("remoteAppRoot") or DEFAULT_REMOTE_APP_ROOT
                command = (
                    "archive={archive}; trap 'rm -f -- \"$archive\"' EXIT; "
                    "command -v tar >/dev/null 2>&1 || {{ echo 'Remote tar command was not found.' >&2; exit 127; }}; "
                    "mkdir -p {root} && tar --no-same-owner -C {root} -xf \"$archive\" && "
                    "test -f {server} && test -f {service} && echo 'Upload received and verified.'"
                ).format(
                    archive=shlex.quote(remote_archive),
                    root=shlex.quote(remote_root),
                    server=shlex.quote(remote_root.rstrip("/") + "/server/server.py"),
                    service=shlex.quote(remote_root.rstrip("/") + "/deployment/linux/root/10-configure-dashboard-service.sh"),
                )
                code = self.connection.execute(command, self.append_log, stop_event=self.stop_event)
                if code != 0:
                    raise RuntimeError("Remote upload verification failed with exit code {}.".format(code))
                self.append_log("[local] Upload completed. Project data was not included.\n")
            except Exception as error:
                self.append_log("[error] Upload failed: {}\n".format(error))
            finally:
                try:
                    local_archive.unlink()
                except OSError:
                    pass
                self.root.after(0, self.finish_task)
        threading.Thread(target=worker, daemon=True).start()

    def run_add_client(self, operation):
        client_id = simpledialog.askstring("添加客户端", "客户端编号（例如 win1）：", parent=self.root)
        if client_id is None:
            return
        client_id = client_id.strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,31}", client_id):
            messagebox.showerror("客户端编号错误", "只能使用字母、数字、下划线和连字符。", parent=self.root)
            return
        server_host = simpledialog.askstring("添加客户端", "客户端连接的服务器 IP 或 DNS：", initialvalue=self.host_var.get(), parent=self.root)
        if not server_host:
            return
        local_port = simpledialog.askstring("添加客户端", "Windows 本地端口；留空自动分配：", parent=self.root)
        if local_port and (not local_port.isdigit() or not 1 <= int(local_port) <= 65535):
            messagebox.showerror("端口错误", "端口必须在 1 到 65535 之间。", parent=self.root)
            return
        display_name = simpledialog.askstring("添加客户端", "使用者显示名称：", initialvalue=client_id, parent=self.root)
        if display_name is None:
            return
        administrator = messagebox.askyesnocancel(
            "添加客户端",
            "这个客户端是否拥有全部项目和管理权限？",
            parent=self.root,
        )
        if administrator is None:
            return
        projects = ""
        if not administrator:
            projects = simpledialog.askstring(
                "添加客户端",
                "允许访问的项目编码，多个用英文逗号分隔：",
                parent=self.root,
            )
            if projects is None:
                return
            projects = projects.strip().upper()
            if projects and not re.fullmatch(r"[A-Z][A-Z0-9_-]{0,31}(,[A-Z][A-Z0-9_-]{0,31})*", projects):
                messagebox.showerror("项目编码错误", "请输入有效项目编码，多个编码用英文逗号分隔。", parent=self.root)
                return
        remote_root = self.settings.get("remoteAppRoot") or DEFAULT_REMOTE_APP_ROOT
        script = remote_root.rstrip("/") + "/deployment/linux/root/30-add-client.sh"
        command = "bash {} --client-id {} --server-host {} --ssh-port {}".format(
            shlex.quote(script), shlex.quote(client_id), shlex.quote(server_host.strip()), shlex.quote(self.port_var.get().strip() or "22")
        )
        if local_port:
            command += " --local-port {}".format(shlex.quote(local_port))
        command += " --display-name {} --admin {} --projects {}".format(
            shlex.quote(display_name.strip() or client_id),
            "y" if administrator else "n",
            shlex.quote(projects),
        )
        destination = Path(self.settings.get("downloadRoot") or (Path.home() / "Downloads" / "EarphoneDashboardClients")) / client_id
        if destination.exists():
            messagebox.showerror("下载目录已存在", "请先处理已有目录：{}".format(destination), parent=self.root)
            return
        self.stop_event.clear()
        self.set_busy(True, "CREATING")
        self.append_log("\n$ {}\n".format(command))

        def worker():
            try:
                code = self.connection.execute(command, self.append_log, stop_event=self.stop_event)
                if code != 0:
                    raise RuntimeError("Client creation failed with exit code {}.".format(code))
                self.download_client_bundle(client_id, destination)
                self.call_on_ui(lambda: messagebox.showinfo("客户端已创建", "客户端包已下载到：\n{}".format(destination), parent=self.root))
            except Exception as error:
                self.append_log("[error] {}\n".format(error))
                self.append_log("[local] If the remote client was created, use '下载已有客户端包' to retry without creating it again.\n")
            finally:
                self.root.after(0, self.finish_task)
        threading.Thread(target=worker, daemon=True).start()

    def run_download_client(self):
        client_id = simpledialog.askstring("下载客户端", "已存在的客户端编号（例如 win1）：", parent=self.root)
        if client_id is None:
            return
        client_id = client_id.strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,31}", client_id):
            messagebox.showerror("客户端编号错误", "只能使用字母、数字、下划线和连字符。", parent=self.root)
            return
        destination = Path(self.settings.get("downloadRoot") or (Path.home() / "Downloads" / "EarphoneDashboardClients")) / client_id
        if destination.exists():
            messagebox.showerror("下载目录已存在", "请先处理已有目录：{}".format(destination), parent=self.root)
            return
        self.stop_event.clear()
        self.set_busy(True, "DOWNLOADING")
        self.append_log("\n[local] Downloading existing client export: {}\n".format(client_id))

        def worker():
            try:
                self.download_client_bundle(client_id, destination)
                self.call_on_ui(lambda: messagebox.showinfo("下载完成", "客户端包已下载到：\n{}".format(destination), parent=self.root))
            except Exception as error:
                self.append_log("[error] {}\n".format(error))
            finally:
                self.root.after(0, self.finish_task)
        threading.Thread(target=worker, daemon=True).start()

    def download_client_bundle(self, client_id, destination):
        partial = destination.parent / ".{}.partial-{}".format(client_id, uuid.uuid4().hex)
        try:
            remote_bundle = "/root/kanban-export/{}".format(client_id)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with self.connection.sftp() as sftp:
                self.download_tree(sftp, remote_bundle, partial)
            launcher = self.client_launcher_path()
            prepare_simple_client_package(partial, launcher)
            partial.replace(destination)
            self.append_log("[local] Simple Windows client downloaded and verified: {}\n".format(destination))
        finally:
            if partial.exists():
                shutil.rmtree(str(partial), ignore_errors=True)

    def client_launcher_path(self):
        candidates = []
        runtime_root = getattr(sys, "_MEIPASS", None)
        if runtime_root:
            candidates.append(Path(runtime_root) / "client-runtime" / "OpenKanban.exe")
        app_root = Path(self.settings.get("localAppRoot") or "")
        candidates.append(app_root / "deployment" / "windows-client-gui" / "dist" / "OpenKanban.exe")
        candidates.append(Path(__file__).resolve().parents[1] / "windows-client-gui" / "dist" / "OpenKanban.exe")
        for candidate in candidates:
            if candidate.is_file():
                return candidate
        raise RuntimeError("OpenKanban.exe is unavailable. Use the current built admin EXE, or build the Windows client first.")

    def download_tree(self, sftp, remote_path, local_path):
        local_path.mkdir(parents=True, exist_ok=False)
        for item in sftp.listdir_attr(remote_path):
            remote_item = remote_path.rstrip("/") + "/" + item.filename
            local_item = local_path / item.filename
            if stat.S_ISDIR(item.st_mode):
                self.download_tree(sftp, remote_item, local_item)
            elif stat.S_ISREG(item.st_mode):
                sftp.get(remote_item, str(local_item))
                self.append_log("[download] {}\n".format(local_item.name))

    def send_input(self):
        value = self.input_var.get()
        if not value:
            return
        try:
            self.connection.send(value + "\n")
            self.append_log("> {}\n".format(value))
            self.input_var.set("")
        except Exception as error:
            messagebox.showerror("无法发送", str(error), parent=self.root)

    def send_secret(self):
        value = simpledialog.askstring("发送隐藏输入", "输入内容不会显示在日志中：", show="*", parent=self.root)
        if value is None:
            return
        try:
            self.connection.send(value + "\n")
            self.append_log("> [hidden]\n")
        except Exception as error:
            messagebox.showerror("无法发送", str(error), parent=self.root)

    def stop_task(self):
        self.stop_event.set()
        self.connection.stop_active()
        self.append_log("\n[local] Stop requested.\n")

    def on_close(self):
        if self.busy and not messagebox.askyesno("退出", "当前任务仍在运行，确定中断并退出吗？", parent=self.root):
            return
        self.stop_event.set()
        self.connection.close()
        self.root.destroy()


def main():
    if sys.platform == "win32":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (AttributeError, OSError):
            pass
    root = tk.Tk()
    app = DashboardAdminApp(root)
    if paramiko is None:
        app.append_log("[error] Paramiko is missing. Run build-admin-tool.bat or install requirements-build.txt.\n")
    root.mainloop()


if __name__ == "__main__":
    main()
