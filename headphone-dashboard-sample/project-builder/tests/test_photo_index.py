from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from native_builder.photo_index import PhotoIndex

try:
    from PIL import Image
except ImportError:  # Core-only Linux environments may intentionally omit thumbnails.
    Image = None


@unittest.skipUnless(Image, "Pillow is required for thumbnail tests")
class PhotoIndexTests(unittest.TestCase):
    def test_incremental_index_and_thumbnail_cache(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            photos = root / "photos"
            source = photos / "U1" / "front.png"
            source.parent.mkdir(parents=True)
            Image.new("RGB", (800, 600), "navy").save(source)
            index = PhotoIndex(root / "cache" / "index.sqlite", root / "cache" / "thumbnails")
            try:
                scanned = index.scan(photos)
                self.assertEqual([item.relative_path for item in scanned], ["U1/front.png"])
                thumb = index.thumbnail(photos, scanned[0], 160)
                self.assertTrue(thumb and thumb.is_file())
                self.assertEqual(index.cached_thumbnail(photos, scanned[0]), thumb)
                self.assertFalse(index.thumbnail_pending(photos, scanned[0]))
                self.assertEqual(index.scan(photos)[0].mtime_ns, scanned[0].mtime_ns)
            finally:
                index.close()


if __name__ == "__main__":
    unittest.main()
