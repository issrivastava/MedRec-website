"""Password hashing + JWT issuance/verification.

Uses PyJWT (maintained). Falls back to python-jose if PyJWT is not installed
so existing environments keep working until requirements are reinstalled.
"""
from datetime import datetime, timedelta, timezone
import uuid

from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

try:  # Preferred: maintained PyJWT
    import jwt as _jwt

    _JWT_LIB = "pyjwt"
except ImportError:  # Fallback: legacy python-jose
    from jose import JWTError as _JoseError, jwt as _jwt  # type: ignore

    _JWT_LIB = "jose"

if _JWT_LIB == "pyjwt":
    from jwt import ExpiredSignatureError, InvalidTokenError as _JwtError
else:
    _JwtError = _JoseError  # type: ignore

# bcrypt hashes only the first 72 bytes — silently truncating longer
# passwords would let "password...X" == "password...Y". Reject upfront.
_BCRYPT_MAX_BYTES = 72


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > _BCRYPT_MAX_BYTES:
        raise ValueError("Password must be at most 72 bytes (bcrypt limit)")
    return pwd_context.hash(password)


def create_access_token(
    subject: str,
    expires_minutes: int | None = None,
    token_version: int = 0,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "nbf": now,
        "iss": settings.JWT_ISSUER,
        "jti": uuid.uuid4().hex,
        "ver": token_version,  # bumped on password change -> old tokens rejected
    }
    return _jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Return the verified claims dict, or None if invalid/expired."""
    try:
        if _JWT_LIB == "pyjwt":
            payload = _jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                issuer=settings.JWT_ISSUER,
                options={"require": ["exp", "sub", "jti"]},
            )
        else:
            payload = _jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            if not payload.get("sub"):
                return None
        return payload
    except Exception:
        return None


def is_expired_token(token: str) -> bool:
    """True if the signature is valid but exp has passed (vs garbage token).

    Lets the API tell the frontend 'session expired — refresh or re-login'
    apart from 'invalid token'. Never raises.
    """
    try:
        if _JWT_LIB == "pyjwt":
            _jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                issuer=settings.JWT_ISSUER,
                options={"verify_signature": True, "verify_exp": False, "require": ["exp", "sub"]},
            )
            # Signature OK, but strict decode failed → must be expiry (or nbf/iss).
            # Confirm by checking exp explicitly.
            try:
                unverified = _jwt.decode(
                    token,
                    options={"verify_signature": False},
                )
                exp = unverified.get("exp")
                if exp is None:
                    return False
                from datetime import timezone as _tz
                now_ts = datetime.now(_tz.utc).timestamp()
                return float(exp) < now_ts
            except Exception:
                return True
        else:
            # jose fallback: can't easily split reason — treat as not-expired.
            return False
    except Exception:
        return False


def decode_subject(token: str) -> str | None:
    payload = decode_token(token)
    return payload.get("sub") if payload else None
