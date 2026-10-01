"""Live badge feed: notifications + chat unread counts over WebSocket.

Batch-2 realtime: the Navbar used to poll /unread-count every 30s (2 HTTP
requests). WS clients get an instant push when notify() inserts a row
(via bump_badges seq) plus a 15s fallback poll and 25s heartbeat, with
HTTP polling as automatic fallback if WS is unavailable.

Connect:  WS /api/ws/badges?token=<JWT>
Message:  {"notifications_unread": int, "messages_unread": int, "seq": int}
"""
from __future__ import annotations
import asyncio
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# user_id -> badge sequence. notify() bumps it (sync code, no event loop
# needed); WS loops watch it and push instantly on change.
_BADGE_SEQ: dict[str, int] = {}


def bump_badges(user_id: str | None) -> None:
    """Wake WS loops for a user. Never raises (called from sync notify())."""
    if not user_id:
        return
    try:
        _BADGE_SEQ[user_id] = _BADGE_SEQ.get(user_id, 0) + 1
    except Exception:
        pass


def _counts_for(user_id: str, role: str) -> dict:
    """Fresh-session unread counts (short-lived session per push)."""
    from app.db.session import SessionLocal
    from app.models.tables import Notification, Message

    notif_unread = 0
    msg_unread = 0
    db = SessionLocal()
    try:
        try:
            notif_unread = db.query(Notification).filter_by(user_id=user_id, read=False).count()
        except Exception:
            notif_unread = 0
        try:
            if role == "patient":
                msg_unread = db.query(Message).filter_by(patient_id=user_id, read=False)\
                    .filter(Message.sender_id != user_id).count()
            elif role == "doctor":
                msg_unread = db.query(Message).filter_by(doctor_id=user_id, read=False)\
                    .filter(Message.sender_id != user_id).count()
        except Exception:
            msg_unread = 0
    finally:
        db.close()
    return {"notifications_unread": notif_unread, "messages_unread": msg_unread}


@router.websocket("/badges")
async def badges_ws(websocket: WebSocket):
    from app.core.security import decode_token

    token = websocket.query_params.get("token") or ""
    claims = decode_token(token) if token else None
    if not claims or not claims.get("sub"):
        await websocket.close(code=4401)
        return
    user_id = claims["sub"]
    # Load role + verify token_version with a throwaway session.
    role = "patient"
    try:
        from app.db.session import SessionLocal
        from app.models.tables import User
        db = SessionLocal()
        try:
            u = db.query(User).filter_by(id=user_id).first()
            if not u:
                await websocket.close(code=4401)
                return
            if (getattr(u, "token_version", 0) or 0) != (claims.get("ver", 0) or 0):
                await websocket.close(code=4401)
                return
            role = u.role or "patient"
        finally:
            db.close()
    except Exception:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    last_seq = _BADGE_SEQ.get(user_id, 0)
    last_push = 0.0
    try:
        counts = _counts_for(user_id, role)
        await websocket.send_json({**counts, "seq": last_seq})
        last_push = time.monotonic()
    except Exception:
        await websocket.close()
        return
    while True:
        try:
            # Wait up to 2s for client ping/close; timeout = chance to push.
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
                # Any client message → reply with fresh counts (keep-alive).
                last_seq = _BADGE_SEQ.get(user_id, 0)
                counts = _counts_for(user_id, role)
                await websocket.send_json({**counts, "seq": last_seq})
                last_push = time.monotonic()
                continue
            except asyncio.TimeoutError:
                pass
            seq = _BADGE_SEQ.get(user_id, 0)
            now = time.monotonic()
            if seq != last_seq:
                last_seq = seq
                counts = _counts_for(user_id, role)
                await websocket.send_json({**counts, "seq": last_seq})
                last_push = now
            elif now - last_push >= 15.0:
                # Fallback poll: catches chat inserts + multi-worker notifies
                # that bumped a different worker's memory.
                counts = _counts_for(user_id, role)
                await websocket.send_json({**counts, "seq": last_seq})
                last_push = now
            elif now - last_push >= 25.0:
                try:
                    await websocket.send_json({"ping": True})
                except Exception:
                    break
        except WebSocketDisconnect:
            break
        except Exception:
            break
