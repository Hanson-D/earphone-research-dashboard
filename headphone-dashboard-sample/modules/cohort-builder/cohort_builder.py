import sqlite3
from pathlib import Path


OPERATORS = {"equals", "not_equals", "between", "in", "is_not_null"}


def quote_identifier(name):
    return '"' + str(name).replace('"', '""') + '"'


def build_where(filters, valid_columns):
    clauses = []
    params = []
    valid_columns = set(valid_columns)

    for filter_item in filters or []:
        column = filter_item.get("column")
        operator = filter_item.get("operator", "equals")
        value = filter_item.get("value")
        if column not in valid_columns:
            raise ValueError(f"非法字段：{column}")
        if operator not in OPERATORS:
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

    return (" AND ".join(clauses) if clauses else "1 = 1", params)


def count_cohort(database_path, table, filters, valid_columns):
    path = Path(database_path).expanduser().resolve()
    where_sql, params = build_where(filters, valid_columns)
    with sqlite3.connect(path) as connection:
        row = connection.execute(
            f"SELECT COUNT(*) FROM {quote_identifier(table)} WHERE {where_sql}",
            params,
        ).fetchone()
    return row[0]
