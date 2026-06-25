from urllib.parse import parse_qs, urlparse

from sql_percentile import compute_percentile_analysis, read_schema


def success(payload):
    return {"ok": True, **payload}


def failure(message, status=400):
    return {"ok": False, "status": status, "error": str(message)}


def schema_response(database_path):
    try:
        return success({"tables": read_schema(database_path)})
    except FileNotFoundError as error:
        return failure(error, 404)
    except Exception as error:
        return failure(error, 400)


def percentile_response(payload):
    try:
        database_path = payload.get("databasePath", "")
        table = payload.get("table", "")
        mappings = payload.get("mappings", [])
        cohort_filters = payload.get("cohortFilters", [])
        if not database_path:
            return failure("databasePath 不能为空")
        if not table:
            return failure("table 不能为空")
        if not isinstance(mappings, list):
            return failure("mappings 必须是数组")
        if not isinstance(cohort_filters, list):
            return failure("cohortFilters 必须是数组")
        return success(compute_percentile_analysis(database_path, table, mappings, cohort_filters))
    except FileNotFoundError as error:
        return failure(error, 404)
    except Exception as error:
        return failure(error, 400)


def route_request(method, path, body=None):
    parsed = urlparse(path)
    if method == "GET" and parsed.path == "/api/sqlite-schema":
        query = parse_qs(parsed.query)
        return schema_response((query.get("path") or [""])[0])
    if method == "POST" and parsed.path == "/api/sqlite-percentiles":
        return percentile_response(body or {})
    return failure(f"未定义的接口：{method} {parsed.path}", 404)
