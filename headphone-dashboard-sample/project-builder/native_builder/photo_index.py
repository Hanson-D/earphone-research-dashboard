from __future__ import annotations

import hashlib
import sqlite3
import threading
from pathlib import Path

from .core import IMAGE_EXTENSIONS, PhotoFile, natural_key


class PhotoIndex:
    """Incremental filesystem index with rebuildable native thumbnails."""

    def __init__(self, database_path: str | Path, thumbnail_root: str | Path):
        self.database_path = Path(database_path)
        self.thumbnail_root = Path(thumbnail_root)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.thumbnail_root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self.connection.execute(
            """CREATE TABLE IF NOT EXISTS photos (
                root TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                absolute_path TEXT NOT NULL,
                size INTEGER NOT NULL,
                mtime_ns INTEGER NOT NULL,
                thumbnail TEXT NOT NULL DEFAULT '',
                error TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (root, relative_path)
            )"""
        )
        self.connection.commit()

    def close(self) -> None:
        with self._lock:
            self.connection.close()

    def scan(self, root: str | Path) -> list[PhotoFile]:
        with self._lock:
            return self._scan(root)

    def _scan(self, root: str | Path) -> list[PhotoFile]:
        root_path = Path(root).expanduser().resolve()
        if not root_path.is_dir():
            raise ValueError(f"照片目录不存在：{root_path}")
        root_key = str(root_path)
        existing = {
            row[0]: row[1:]
            for row in self.connection.execute(
                "SELECT relative_path, absolute_path, size, mtime_ns, thumbnail, error FROM photos WHERE root = ?",
                (root_key,),
            )
        }
        found: set[str] = set()
        photos: list[PhotoFile] = []
        for path in root_path.rglob("*"):
            if not path.is_file() or path.name.startswith(".") or path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            photo = PhotoFile.from_path(root_path, path)
            found.add(photo.relative_path)
            photos.append(photo)
            old = existing.get(photo.relative_path)
            if not old or old[1] != photo.size or old[2] != photo.mtime_ns:
                self.connection.execute(
                    """INSERT INTO photos(root, relative_path, absolute_path, size, mtime_ns, thumbnail, error)
                       VALUES(?, ?, ?, ?, ?, '', '')
                       ON CONFLICT(root, relative_path) DO UPDATE SET
                         absolute_path=excluded.absolute_path, size=excluded.size,
                         mtime_ns=excluded.mtime_ns, thumbnail='', error=''""",
                    (root_key, photo.relative_path, photo.absolute_path, photo.size, photo.mtime_ns),
                )
        stale = set(existing) - found
        if stale:
            self.connection.executemany(
                "DELETE FROM photos WHERE root = ? AND relative_path = ?",
                [(root_key, item) for item in stale],
            )
        self.connection.commit()
        return sorted(photos, key=lambda item: natural_key(item.relative_path))

    def thumbnail(self, root: str | Path, photo: PhotoFile, size: int = 240) -> Path | None:
        with self._lock:
            return self._thumbnail(root, photo, size)

    def cached_thumbnail(self, root: str | Path, photo: PhotoFile) -> Path | None:
        root_key = str(Path(root).expanduser().resolve())
        with self._lock:
            cached = self.connection.execute(
                "SELECT thumbnail, size, mtime_ns FROM photos WHERE root = ? AND relative_path = ?",
                (root_key, photo.relative_path),
            ).fetchone()
        if cached and cached[0] and cached[1] == photo.size and cached[2] == photo.mtime_ns:
            candidate = Path(cached[0])
            return candidate if candidate.is_file() else None
        return None

    def thumbnail_pending(self, root: str | Path, photo: PhotoFile) -> bool:
        root_key = str(Path(root).expanduser().resolve())
        with self._lock:
            row = self.connection.execute(
                "SELECT thumbnail, error, size, mtime_ns FROM photos WHERE root = ? AND relative_path = ?",
                (root_key, photo.relative_path),
            ).fetchone()
        return not row or row[2] != photo.size or row[3] != photo.mtime_ns or (not row[0] and not row[1])

    def _thumbnail(self, root: str | Path, photo: PhotoFile, size: int = 240) -> Path | None:
        root_key = str(Path(root).expanduser().resolve())
        cached = self.connection.execute(
            "SELECT thumbnail, size, mtime_ns FROM photos WHERE root = ? AND relative_path = ?",
            (root_key, photo.relative_path),
        ).fetchone()
        if cached and cached[0] and cached[1] == photo.size and cached[2] == photo.mtime_ns:
            candidate = Path(cached[0])
            if candidate.is_file():
                return candidate
        digest = hashlib.sha256(f"{root_key}\0{photo.relative_path}\0{photo.size}\0{photo.mtime_ns}\0{size}\0v1".encode()).hexdigest()
        target = self.thumbnail_root / digest[:2] / f"{digest}.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            from PIL import Image, ImageOps

            with Image.open(photo.absolute_path) as image:
                image = ImageOps.exif_transpose(image)
                image.thumbnail((size, size), Image.Resampling.LANCZOS)
                if image.mode not in {"RGB", "L"}:
                    background = Image.new("RGB", image.size, "white")
                    if "A" in image.getbands():
                        background.paste(image, mask=image.getchannel("A"))
                    else:
                        background.paste(image)
                    image = background
                image.convert("RGB").save(target, "JPEG", quality=84, optimize=True)
            self.connection.execute(
                "UPDATE photos SET thumbnail = ?, error = '' WHERE root = ? AND relative_path = ?",
                (str(target), root_key, photo.relative_path),
            )
            self.connection.commit()
            return target
        except Exception as error:  # corrupt/unsupported files belong in audit, not a crash
            self.connection.execute(
                "UPDATE photos SET error = ? WHERE root = ? AND relative_path = ?",
                (str(error), root_key, photo.relative_path),
            )
            self.connection.commit()
            return None

    def errors(self, root: str | Path) -> list[dict[str, str]]:
        root_key = str(Path(root).expanduser().resolve())
        with self._lock:
            return [
                {"relative_path": relative, "error": error}
                for relative, error in self.connection.execute(
                    "SELECT relative_path, error FROM photos WHERE root = ? AND error <> '' ORDER BY relative_path",
                    (root_key,),
                )
            ]
