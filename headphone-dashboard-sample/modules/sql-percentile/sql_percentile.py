import sqlite3
from pathlib import Path
from statistics import mean, pstdev


NUMERIC_TYPES = {"INTEGER", "INT", "REAL", "DOUBLE", "FLOAT", "NUMERIC", "DECIMAL"}
FILTER_OPERATORS = {"equals", "not_equals", "between", "in", "is_not_null"}


def quote_identifier(name):
    return '"' + str(name).replace('"', '""') + '"'


def read_schema(database_path):
    path = Path(database_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"数据库文件不存在：{path}")

    with sqlite3.connect(path) as connection:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
        tables = []
        for (table_name,) in rows:
            columns = connection.execute(f"PRAGMA table_info({quote_identifier(table_name)})").fetchall()
            tables.append({
                "name": table_name,
                "columns": [{
                    "name": column[1],
                    "type": column[2] or "",
                    "numeric": is_numeric_type(column[2] or ""),
                } for column in columns],
            })
        return tables


def is_numeric_type(sqlite_type):
    upper_type = sqlite_type.upper()
    return any(token in upper_type for token in NUMERIC_TYPES)


def summarize_distribution(values, subject_value):
    if not values:
        raise ValueError("values 不能为空")

    sorted_values = sorted(values)
    sample_size = len(sorted_values)
    below_count = sum(1 for value in sorted_values if value < subject_value)
    equal_count = sum(1 for value in sorted_values if value == subject_value)
    less_equal = below_count + equal_count
    distribution_mean = mean(sorted_values)
    distribution_sd = pstdev(sorted_values) if sample_size > 1 else 0.0
    z_score = None if distribution_sd == 0 else (subject_value - distribution_mean) / distribution_sd
    return {
        "sampleSize": sample_size,
        "percentile": less_equal / sample_size * 100,
        "rank": less_equal,
        "belowCount": below_count,
        "equalCount": equal_count,
        "min": sorted_values[0],
        "max": sorted_values[-1],
        "mean": distribution_mean,
        "sd": distribution_sd,
        "zScore": z_score,
    }


def build_filter_where(filters, valid_columns):
    clauses = []
    params = []
    valid_columns = set(valid_columns)
    for filter_item in filters or []:
        column = filter_item.get("column")
        operator = filter_item.get("operator", "equals")
        value = filter_item.get("value")
        if column not in valid_columns:
            raise ValueError(f"非法筛选字段：{column}")
        if operator not in FILTER_OPERATORS:
            raise ValueError(f"不支持的筛选条件：{operator}")

        quoted_column = quote_identifier(column)
        if operator == "is_not_null":
            clauses.append(f"{quoted_column} IS NOT NULL")
        elif operator == "equals":
            clauses.append(f"{quoted_column} = ?")
            params.append(value)
        elif operator == "not_equals":
            clauses.append(f"{quoted_column} != ?")
            params.append(value)
        elif operator == "between":
            if not isinstance(value, list) or len(value) != 2:
                raise ValueError(f"between 需要两个边界值：{column}")
            clauses.append(f"{quoted_column} BETWEEN ? AND ?")
            params.extend([min(value), max(value)])
        elif operator == "in":
            if not isinstance(value, list) or not value:
                raise ValueError(f"in 需要非空列表：{column}")
            placeholders = ", ".join("?" for _ in value)
            clauses.append(f"{quoted_column} IN ({placeholders})")
            params.extend(value)
    return clauses, params


def compute_percentile_analysis(database_path, table, mappings, cohort_filters=None):
    path = Path(database_path).expanduser().resolve()
    schema = read_schema(path)
    table_info = next((item for item in schema if item["name"] == table), None)
    if not table_info:
        raise ValueError(f"数据库中不存在表：{table}")

    valid_columns = {column["name"] for column in table_info["columns"]}
    filter_clauses, filter_params = build_filter_where(cohort_filters, valid_columns)
    results = []
    warnings = []
    with sqlite3.connect(path) as connection:
        for mapping in mappings:
            db_column = mapping.get("dbColumn", "")
            if db_column not in valid_columns:
                warnings.append({
                    "dashboardField": mapping.get("dashboardField", ""),
                    "dbColumn": db_column,
                    "message": f"数据库字段不存在：{db_column}",
                })
                continue
            try:
                subject_value = float(mapping.get("value"))
            except (TypeError, ValueError):
                warnings.append({
                    "dashboardField": mapping.get("dashboardField", ""),
                    "dbColumn": db_column,
                    "message": f"当前值无法转换为数字：{mapping.get('value')}",
                })
                continue

            where_clauses = [f"{quote_identifier(db_column)} IS NOT NULL", *filter_clauses]
            rows = connection.execute(
                f"SELECT {quote_identifier(db_column)} FROM {quote_identifier(table)} "
                f"WHERE {' AND '.join(where_clauses)}",
                filter_params,
            ).fetchall()
            values = []
            for (raw_value,) in rows:
                try:
                    values.append(float(raw_value))
                except (TypeError, ValueError):
                    pass

            if not values:
                warnings.append({
                    "dashboardField": mapping.get("dashboardField", ""),
                    "dbColumn": db_column,
                    "message": "参照队列中没有可用数值",
                })
                continue

            results.append({
                "dashboardField": mapping.get("dashboardField", ""),
                "dbColumn": db_column,
                "value": subject_value,
                "cohortFiltered": bool(cohort_filters),
                **summarize_distribution(values, subject_value),
            })
    return {
        "table": table,
        "cohortFiltered": bool(cohort_filters),
        "resultCount": len(results),
        "warningCount": len(warnings),
        "results": results,
        "warnings": warnings,
    }


def compute_percentiles(database_path, table, mappings, cohort_filters=None):
    return compute_percentile_analysis(database_path, table, mappings, cohort_filters)["results"]
