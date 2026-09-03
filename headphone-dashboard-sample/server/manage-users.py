#!/usr/bin/env python3
import argparse
import getpass
from pathlib import Path

import dashboard_auth as auth
import project_catalog as catalog


def read_value(prompt, default=""):
    suffix = " [{}]".format(default) if default else ""
    value = input("{}{}: ".format(prompt, suffix)).strip()
    return value or default


def read_password():
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise ValueError("Passwords do not match.")
    return password


def validate_projects(projects, projects_root):
    if not projects_root:
        return
    index = catalog.load_catalog(projects_root)
    active = {
        code for code, record in index.get("projects", {}).items()
        if not record.get("missing")
    }
    unknown = [code for code in projects if code not in active]
    if unknown:
        raise ValueError("Unknown or missing project codes: {}. Run project sync first.".format(", ".join(unknown)))


def load_or_initialize(path):
    auth.initialize_config(path)
    return auth.load_config(path)


def add_user(path, projects_root=None):
    config = load_or_initialize(path)
    username = auth.validate_username(read_value("Username"))
    if username in config["users"]:
        raise ValueError("User already exists: {}".format(username))
    display_name = read_value("Display name", username)
    admin = read_value("Administrator (y/N)", "N").lower() == "y"
    projects = ["*"] if admin else [
        code.upper() for code in auth.normalize_projects(read_value("Project codes, comma separated"))
    ]
    if not admin:
        validate_projects(projects, projects_root)
    config["users"][username] = {
        "displayName": display_name,
        "password": auth.hash_password(read_password()),
        "admin": admin,
        "projects": projects,
        "revision": 1,
    }
    auth.save_config(config, path)
    print("Added dashboard user: {}".format(username))


def list_users(path, projects_root=None):
    config = load_or_initialize(path)
    if not config["users"]:
        print("No dashboard users configured.")
        return
    print("USERNAME\tADMIN\tPROJECTS\tDISPLAY NAME")
    for username in sorted(config["users"]):
        record = config["users"][username]
        projects = "*" if record.get("admin") else ",".join(auth.normalize_projects(record.get("projects")))
        print("{}\t{}\t{}\t{}".format(
            username,
            "yes" if record.get("admin") else "no",
            projects or "-",
            record.get("displayName") or username,
        ))


def set_projects(path, projects_root=None):
    config = load_or_initialize(path)
    username = auth.validate_username(read_value("Username"))
    record = config["users"].get(username)
    if not record:
        raise ValueError("Unknown user: {}".format(username))
    admin = read_value("Administrator (y/N)", "y" if record.get("admin") else "N").lower() == "y"
    projects = ["*"] if admin else [
        code.upper() for code in auth.normalize_projects(read_value(
            "Project codes, comma separated",
            ",".join(auth.normalize_projects(record.get("projects"))),
        ))
    ]
    if not admin:
        validate_projects(projects, projects_root)
    record["admin"] = admin
    record["projects"] = projects
    record["revision"] = int(record.get("revision") or 1) + 1
    auth.save_config(config, path)
    print("Updated dashboard access: {}".format(username))


def reset_password(path, projects_root=None):
    config = load_or_initialize(path)
    username = auth.validate_username(read_value("Username"))
    record = config["users"].get(username)
    if not record:
        raise ValueError("Unknown user: {}".format(username))
    record["password"] = auth.hash_password(read_password())
    record["revision"] = int(record.get("revision") or 1) + 1
    auth.save_config(config, path)
    print("Reset password and revoked existing sessions: {}".format(username))


def delete_user(path, projects_root=None):
    config = load_or_initialize(path)
    username = auth.validate_username(read_value("Username"))
    if username not in config["users"]:
        raise ValueError("Unknown user: {}".format(username))
    confirmation = read_value("Type the username again to delete")
    if confirmation != username:
        raise ValueError("Confirmation did not match.")
    del config["users"][username]
    auth.save_config(config, path)
    print("Deleted dashboard user: {}".format(username))


def main():
    parser = argparse.ArgumentParser(description="Manage dashboard login users.")
    parser.add_argument("--config", required=True)
    parser.add_argument("--projects-root")
    parser.add_argument("operation", choices=["init", "add", "list", "set-projects", "reset-password", "delete"])
    args = parser.parse_args()
    path = Path(args.config)
    if args.operation == "init":
        created = auth.initialize_config(path)
        print("Created authentication config." if created else "Authentication config already exists.")
        return
    operations = {
        "add": add_user,
        "list": list_users,
        "set-projects": set_projects,
        "reset-password": reset_password,
        "delete": delete_user,
    }
    operations[args.operation](path, args.projects_root)


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled.")
        raise SystemExit(1)
    except ValueError as error:
        print("ERROR: {}".format(error))
        raise SystemExit(1)
