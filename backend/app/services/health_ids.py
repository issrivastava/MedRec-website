"""AH-XXXX health IDs: random alphanumeric, unique across users + family_members.

Format: AH- + 4 chars from unambiguous set (no I,O,0,1).
Example: AH-8K2P, AH-X7MD.
"""
from __future__ import annotations
import re
import secrets

PREFIX = "AH-"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I,O,0,1
CODE_LEN = 4
PATTERN = re.compile(r"^AH-[A-Z2-9]{4}$")

MAX_ATTEMPTS = 50


def is_valid(health_id: str | None) -> bool:
    return bool(health_id) and bool(PATTERN.match(health_id))


def _random_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))


def generate_unique_health_id(db) -> str:
    """Generate an AH-XXXX not used by any user or family member."""
    from app.models.tables import User, FamilyMember

    for _ in range(MAX_ATTEMPTS):
        hid = f"{PREFIX}{_random_code()}"
        if db.query(User).filter_by(health_id=hid).first():
            continue
        if db.query(FamilyMember).filter_by(health_id=hid).first():
            continue
        return hid
    raise RuntimeError("Could not generate a unique health ID, try again")


def ensure_health_id(db, obj):
    """Assign a health_id to a User/FamilyMember missing one. Returns the id."""
    if getattr(obj, "health_id", None):
        return obj.health_id
    obj.health_id = generate_unique_health_id(db)
    return obj.health_id


def backfill_missing(db) -> dict:
    """Assign AH-XXXX to every user + family member missing one. Returns counts."""
    from app.models.tables import User, FamilyMember

    users_done = 0
    family_done = 0
    for u in db.query(User).filter((User.health_id.is_(None)) | (User.health_id == "")).all():
        u.health_id = generate_unique_health_id(db)
        db.flush()
        users_done += 1
    for m in db.query(FamilyMember).filter(
        (FamilyMember.health_id.is_(None)) | (FamilyMember.health_id == "")
    ).all():
        m.health_id = generate_unique_health_id(db)
        db.flush()
        family_done += 1
    db.commit()
    return {"users": users_done, "family_members": family_done}
