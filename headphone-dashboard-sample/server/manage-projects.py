#!/usr/bin/env python3
import argparse
from pathlib import Path

import project_catalog as catalog
import dashboard_auth as auth


def print_projects(payload):
    projects = payload.get("projects", {})
    if not projects:
        print("No indexed dashboard projects. Run sync after adding project JSON files.")
        return
    print("CODE\tSTATUS\tTITLE\tPATH")
    for code in sorted(projects):
        record = projects[code]
        print("{}\t{}\t{}\t{}".format(
            code,
            "missing" if record.get("missing") else "active",
            record.get("title") or "-",
            record.get("path") or "-",
        ))


def main():
    parser = argparse.ArgumentParser(description="Maintain external dashboard project codes.")
    parser.add_argument("--root", required=True)
    parser.add_argument("--auth-config")
    parser.add_argument("operation", choices=["sync", "list", "set-code", "relink"])
    args = parser.parse_args()
    root = Path(args.root)

    if args.operation == "sync":
        result = catalog.sync_catalog(root)
        for item in result["assigned"]:
            print("ASSIGNED\t{}\t{}\t{}".format(item["code"], item["title"], item["path"]))
        for item in result["moved"]:
            print("MOVED\t{}\t{} -> {}".format(item["code"], item["from"], item["to"]))
        for item in result["missing"]:
            print("MISSING\t{}\t{}".format(item["code"], item["path"]))
        print_projects(result["catalog"])
        return

    if args.operation == "list":
        print_projects(catalog.load_catalog(root))
        return

    if args.operation == "set-code":
        current_code = input("Current project code: ").strip()
        new_code = input("New project code: ").strip()
        record = catalog.set_project_code(root, current_code, new_code)
        current_code = current_code.upper()
        new_code = new_code.upper()
        updated_users = []
        if args.auth_config and Path(args.auth_config).is_file():
            access = auth.load_config(args.auth_config)
            for username, user in access.get("users", {}).items():
                projects = auth.normalize_projects(user.get("projects"))
                if current_code in projects:
                    user["projects"] = [new_code if code == current_code else code for code in projects]
                    user["revision"] = int(user.get("revision") or 1) + 1
                    updated_users.append(username)
            if updated_users:
                auth.save_config(access, args.auth_config)
        print("UPDATED\t{}\t{}\t{}".format(new_code, record.get("title"), record.get("path")))
        if updated_users:
            print("UPDATED USERS\t{}".format(",".join(sorted(updated_users))))
        return

    code = input("Project code: ").strip()
    relative_path = input("Relative project JSON path: ").strip()
    record = catalog.relink_project(root, code, relative_path)
    print("RELINKED\t{}\t{}\t{}".format(code.upper(), record.get("title"), record.get("path")))


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled.")
        raise SystemExit(1)
    except (OSError, ValueError) as error:
        print("ERROR: {}".format(error))
        raise SystemExit(1)
