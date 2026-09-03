#!/usr/bin/env python3
import argparse
import os
import secrets
from pathlib import Path

import dashboard_auth as access
import project_catalog as catalog


def read_value(prompt, default=""):
    suffix = " [{}]".format(default) if default else ""
    value = input("{}{}: ".format(prompt, suffix)).strip()
    return value or default


def parse_admin(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "y")


def validate_projects(projects, projects_root):
    projects = access.normalize_projects(projects)
    if not projects_root:
        return projects
    index = catalog.load_catalog(projects_root)
    active = {
        code for code, record in index.get("projects", {}).items()
        if not record.get("missing")
    }
    unknown = [code for code in projects if code not in active]
    if unknown:
        raise ValueError("Unknown or missing project codes: {}. Run project sync first.".format(", ".join(unknown)))
    return projects


def load_or_initialize(path):
    access.initialize_config(path)
    return access.load_config(path)


def resolve_client_id(args):
    return access.validate_client_id(args.client_id or read_value("Client ID"))


def add_client(args, path):
    config = load_or_initialize(path)
    client_id = resolve_client_id(args)
    if client_id in config["clients"]:
        raise ValueError("Client already exists in access config: {}".format(client_id))
    port = access.validate_access_port(args.port or read_value("Dedicated server access port"))
    backend_port = int(os.environ.get("DASHBOARD_PORT", "7362"))
    if port == backend_port:
        raise ValueError("Client access port cannot be the private backend port {}.".format(backend_port))
    for other_id, record in config["clients"].items():
        if int(record.get("port")) == port:
            raise ValueError("Client access port {} is already assigned to {}.".format(port, other_id))
    display_name = args.display_name or read_value("Display name", client_id)
    admin = parse_admin(args.admin) if args.admin is not None else parse_admin(read_value("Administrator (y/N)", "N"))
    raw_projects = args.projects
    if raw_projects is None and not admin:
        raw_projects = read_value("Project codes, comma separated")
    projects = ["*"] if admin else validate_projects(raw_projects or "", args.projects_root)
    config["clients"][client_id] = {
        "displayName": display_name,
        "port": port,
        "admin": admin,
        "projects": projects,
        "disabled": False,
        "token": args.token or secrets.token_urlsafe(32),
    }
    access.save_config(config, path)
    print("Added client access: {} -> {}".format(client_id, port))


def list_clients(args, path):
    config = load_or_initialize(path)
    if not config["clients"]:
        print("No client access records configured.")
        return
    print("CLIENT\tPORT\tSTATUS\tADMIN\tPROJECTS\tDISPLAY NAME")
    for client_id in sorted(config["clients"]):
        record = config["clients"][client_id]
        projects = "*" if record.get("admin") else ",".join(access.normalize_projects(record.get("projects")))
        print("{}\t{}\t{}\t{}\t{}\t{}".format(
            client_id,
            record.get("port"),
            "disabled" if record.get("disabled") else "active",
            "yes" if record.get("admin") else "no",
            projects or "-",
            record.get("displayName") or client_id,
        ))


def set_projects(args, path):
    config = load_or_initialize(path)
    client_id = resolve_client_id(args)
    record = config["clients"].get(client_id)
    if not record:
        raise ValueError("Unknown client: {}".format(client_id))
    display_name = args.display_name or read_value("Display name", record.get("displayName") or client_id)
    if args.admin is None:
        admin = parse_admin(read_value("Administrator (y/N)", "y" if record.get("admin") else "N"))
    else:
        admin = parse_admin(args.admin)
    raw_projects = args.projects
    if raw_projects is None and not admin:
        raw_projects = read_value(
            "Project codes, comma separated",
            ",".join(access.normalize_projects(record.get("projects"))),
        )
    record["displayName"] = display_name
    record["admin"] = admin
    record["projects"] = ["*"] if admin else validate_projects(raw_projects or "", args.projects_root)
    access.save_config(config, path)
    print("Updated client access: {}".format(client_id))


def set_disabled(args, path, disabled):
    config = load_or_initialize(path)
    client_id = resolve_client_id(args)
    record = config["clients"].get(client_id)
    if not record:
        raise ValueError("Unknown client: {}".format(client_id))
    record["disabled"] = disabled
    access.save_config(config, path)
    print("{} client access: {}".format("Disabled" if disabled else "Enabled", client_id))


def set_port(args, path):
    config = load_or_initialize(path)
    client_id = resolve_client_id(args)
    record = config["clients"].get(client_id)
    if not record:
        raise ValueError("Unknown client: {}".format(client_id))
    port = access.validate_access_port(args.port or read_value("Dedicated server access port"))
    backend_port = int(os.environ.get("DASHBOARD_PORT", "7362"))
    if port == backend_port:
        raise ValueError("Client access port cannot be the private backend port {}.".format(backend_port))
    for other_id, other_record in config["clients"].items():
        if other_id != client_id and int(other_record.get("port")) == port:
            raise ValueError("Client access port {} is already assigned to {}.".format(port, other_id))
    record["port"] = port
    access.save_config(config, path)
    print("Updated client access port: {} -> {}".format(client_id, port))


def set_token(args, path):
    config = load_or_initialize(path)
    client_id = resolve_client_id(args)
    record = config["clients"].get(client_id)
    if not record:
        raise ValueError("Unknown client: {}".format(client_id))
    record["token"] = access.validate_access_token(args.token)
    access.save_config(config, path)
    print("Updated client access token: {}".format(client_id))


def remove_client(args, path):
    config = load_or_initialize(path)
    client_id = resolve_client_id(args)
    if client_id not in config["clients"]:
        return
    if not args.yes:
        confirmation = read_value("Type the client ID again to remove access record")
        if confirmation != client_id:
            raise ValueError("Confirmation did not match.")
    del config["clients"][client_id]
    access.save_config(config, path)
    print("Removed client access record: {}".format(client_id))


def main():
    parser = argparse.ArgumentParser(description="Manage SSH-key-bound dashboard client access.")
    parser.add_argument("--config", required=True)
    parser.add_argument("--projects-root")
    parser.add_argument("--client-id")
    parser.add_argument("--port")
    parser.add_argument("--display-name")
    parser.add_argument("--admin")
    parser.add_argument("--projects")
    parser.add_argument("--token")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("operation", choices=["init", "add", "list", "set-projects", "set-port", "set-token", "disable", "enable", "remove"])
    args = parser.parse_args()
    path = Path(args.config)
    if args.operation == "init":
        created = access.initialize_config(path)
        print("Created client access config." if created else "Client access config is ready.")
        return
    operations = {
        "add": add_client,
        "list": list_clients,
        "set-projects": set_projects,
        "set-port": set_port,
        "set-token": set_token,
        "disable": lambda item, target: set_disabled(item, target, True),
        "enable": lambda item, target: set_disabled(item, target, False),
        "remove": remove_client,
    }
    operations[args.operation](args, path)


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled.")
        raise SystemExit(1)
    except (OSError, ValueError) as error:
        print("ERROR: {}".format(error))
        raise SystemExit(1)
