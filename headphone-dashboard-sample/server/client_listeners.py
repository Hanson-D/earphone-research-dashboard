#!/usr/bin/env python3
import json
import threading

import dashboard_auth as access


class ClientListenerManager:
    def __init__(self, handler_class, server_class, config_path, host="127.0.0.1", interval=1.0, logger=print, reserved_ports=None):
        self.handler_class = handler_class
        self.server_class = server_class
        self.config_path = config_path
        self.host = host
        self.interval = interval
        self.logger = logger
        self.reserved_ports = set(reserved_ports or [])
        self.listeners = {}
        self.stop_event = threading.Event()
        self.thread = None
        self.last_signature = None

    def config_signature(self):
        try:
            stat = self.config_path.stat()
            return (stat.st_mtime_ns, stat.st_size)
        except OSError:
            return None

    def desired(self):
        desired = access.active_client_ports(access.load_config(self.config_path))
        conflict = self.reserved_ports.intersection(desired)
        if conflict:
            raise ValueError("Client access uses reserved port: {}".format(sorted(conflict)[0]))
        return desired

    def start_listener(self, port, client_id):
        httpd = self.server_class((self.host, port), self.handler_class)
        httpd.dashboard_client_id = client_id
        thread = threading.Thread(
            target=httpd.serve_forever,
            name="dashboard-client-{}".format(client_id),
            daemon=True,
        )
        thread.start()
        self.listeners[port] = (client_id, httpd, thread)
        self.logger("Client listener: {} -> http://{}:{}".format(client_id, self.host, port))

    def stop_listener(self, port):
        client_id, httpd, thread = self.listeners.pop(port)
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)
        self.logger("Client listener stopped: {} ({})".format(client_id, port))

    def reconcile(self, force=False):
        signature = self.config_signature()
        if not force and signature == self.last_signature:
            return
        desired = self.desired()
        current = {port: item[0] for port, item in self.listeners.items()}
        for port, client_id in list(current.items()):
            if desired.get(port) != client_id:
                self.stop_listener(port)
        failed = False
        for port, client_id in desired.items():
            if port not in self.listeners:
                try:
                    self.start_listener(port, client_id)
                except OSError as error:
                    failed = True
                    self.logger("ERROR: Cannot listen for client {} on {}:{}: {}".format(client_id, self.host, port, error))
        self.last_signature = None if failed else signature

    def run(self):
        while not self.stop_event.wait(self.interval):
            try:
                self.reconcile()
            except (OSError, ValueError, json.JSONDecodeError) as error:
                self.logger("ERROR: Client listener reload failed: {}".format(error))

    def start(self):
        self.reconcile(force=True)
        self.thread = threading.Thread(target=self.run, name="dashboard-client-listener-manager", daemon=True)
        self.thread.start()

    def close(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2)
        for port in list(self.listeners):
            self.stop_listener(port)
