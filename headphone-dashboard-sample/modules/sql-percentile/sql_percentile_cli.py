import argparse
import json
from pathlib import Path

from sql_percentile_api import percentile_response, schema_response
from sql_percentile_fixture import create_fixture_database, sample_percentile_payload


def read_payload(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def write_json(payload):
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main(argv=None):
    parser = argparse.ArgumentParser(description="SQL percentile module CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    fixture_parser = subparsers.add_parser("fixture", help="create a sample SQLite database")
    fixture_parser.add_argument("database_path")
    fixture_parser.add_argument("--print-payload", action="store_true")

    schema_parser = subparsers.add_parser("schema", help="read SQLite schema")
    schema_parser.add_argument("database_path")

    percentile_parser = subparsers.add_parser("percentile", help="compute percentile response from JSON payload")
    percentile_parser.add_argument("payload_path")

    args = parser.parse_args(argv)
    if args.command == "fixture":
        database_path = create_fixture_database(Path(args.database_path))
        response = {"ok": True, "databasePath": str(database_path)}
        if args.print_payload:
            response["payload"] = sample_percentile_payload(database_path)
        write_json(response)
        return response

    if args.command == "schema":
        response = schema_response(args.database_path)
        write_json(response)
        return response

    if args.command == "percentile":
        response = percentile_response(read_payload(args.payload_path))
        write_json(response)
        return response


if __name__ == "__main__":
    main()
