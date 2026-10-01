"""Notifications ops: mark-all-read actually marks, clear-all actually deletes.

Regression test: the "Mark all read" button appeared broken (stale navbar badge
+ silent failures hid the result). Uses an isolated sqlite DB and mounts only
the notifications router — never the dev database.

Run from backend/:  .venv\\Scripts\\python -m pytest tests/ -q
"""
import app.models.tables as _tables  # noqa: F401 — register all models on Base
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes import notifications as notif_routes
from app.core.deps import get_current_user
from app.db.session import Base, get_db
from app.models.tables import Notification, User

app = FastAPI()
app.include_router(notif_routes.router)


def _client(tmp_path):
    db_file = tmp_path / "notif.db"
    eng = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    db = factory()
    user = User(email="n@test.com", hashed_password="x", full_name="N", role="patient")
    db.add(user)
    db.commit()
    db.refresh(user)
    uid = user.id

    def override_db():
        d = factory()
        try:
            yield d
        finally:
            d.close()

    def override_user():
        d = factory()
        try:
            return d.query(User).filter_by(id=uid).first()
        finally:
            d.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    return TestClient(app, raise_server_exceptions=False), factory, uid


def _seed(factory, uid, n=3):
    db = factory()
    try:
        for i in range(n):
            db.add(Notification(user_id=uid, kind="test", title=f"N{i}"))
        db.commit()
    finally:
        db.close()


def test_read_all_marks_everything(tmp_path):
    client, factory, uid = _client(tmp_path)
    _seed(factory, uid, 3)
    r = client.post("/read-all")
    assert r.status_code == 200, r.text
    assert r.json()["marked"] == 3
    assert client.get("/unread-count").json()["unread"] == 0
    assert all(n["read"] for n in client.get("/my").json())


def test_clear_all_deletes_everything(tmp_path):
    client, factory, uid = _client(tmp_path)
    _seed(factory, uid, 2)
    r = client.delete("/my")
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] == 2
    assert client.get("/my").json() == []
    assert client.get("/unread-count").json()["unread"] == 0
