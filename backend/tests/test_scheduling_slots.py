"""30-minute chunks: block lookup + chunk-end capping. Run from backend/."""
from datetime import time as dtime
from types import SimpleNamespace

from app.api.routes.scheduling import _block_for_time, _chunk_end


class _FakeQ:
    def __init__(self, blocks):
        self.blocks = blocks

    def filter_by(self, **kw):
        return self

    def all(self):
        return self.blocks


class _FakeDB:
    def __init__(self, blocks):
        self.blocks = blocks

    def query(self, model):
        return _FakeQ(self.blocks)


def _db():
    return _FakeDB([SimpleNamespace(start_time=dtime(10, 0), end_time=dtime(13, 0))])


def test_chunk_inside_block_found():
    assert _block_for_time(_db(), "d1", 0, dtime(10, 30)) is not None
    assert _block_for_time(_db(), "d1", 0, dtime(12, 30)) is not None


def test_outside_block_rejected():
    assert _block_for_time(_db(), "d1", 0, dtime(9, 30)) is None
    assert _block_for_time(_db(), "d1", 0, dtime(13, 0)) is None


def test_chunk_end_is_30_minute():
    block = _block_for_time(_db(), "d1", 0, dtime(10, 30))
    assert _chunk_end(block, dtime(10, 30)) == dtime(11, 0)


def test_chunk_end_capped_at_block_end():
    block = SimpleNamespace(start_time=dtime(10, 0), end_time=dtime(10, 45))
    assert _chunk_end(block, dtime(10, 30)) == dtime(10, 45)
