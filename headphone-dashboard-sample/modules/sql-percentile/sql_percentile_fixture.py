import sqlite3
from pathlib import Path


FIXTURE_ROWS = [
    ("U001", "left", "female", 24, 20.0, 10.0),
    ("U002", "left", "female", 32, 24.0, 11.0),
    ("U003", "right", "male", 35, 28.0, 12.0),
    ("U004", "left", "male", 41, 30.0, 13.5),
]


def create_fixture_database(database_path):
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.execute("DROP TABLE IF EXISTS ear_data")
        connection.execute(
            """
            CREATE TABLE ear_data (
              subject_id TEXT,
              ear_side TEXT,
              sex TEXT,
              age INTEGER,
              concha_width REAL,
              ear_canal_depth REAL
            )
            """
        )
        connection.executemany(
            "INSERT INTO ear_data VALUES (?, ?, ?, ?, ?, ?)",
            FIXTURE_ROWS,
        )
    return path


def sample_percentile_payload(database_path):
    return {
        "databasePath": str(database_path),
        "table": "ear_data",
        "cohortFilters": [{"column": "ear_side", "operator": "equals", "value": "left"}],
        "mappings": [
            {"dashboardField": "concha_width_mm", "dbColumn": "concha_width", "value": 24.0},
            {"dashboardField": "earCanalDepth", "dbColumn": "ear_canal_depth", "value": 11.0},
        ],
    }
