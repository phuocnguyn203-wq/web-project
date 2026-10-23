import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User

SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
_bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    salt = secrets.token_hex(16)
    return f"{salt}${hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 200_000).hex()}"


def verify_password(pw: str, stored: str) -> bool:
    salt, digest = stored.split("$", 1)
    return hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex(), digest)


def make_token(user: User) -> str:
    exp = datetime.now(UTC) + timedelta(days=7)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, SECRET, "HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    token: str | None = Query(None, description="For <video>/download links that can't send headers"),
    db: Session = Depends(get_db),
) -> User:
    raw = creds.credentials if creds else token
    if not raw:
        raise HTTPException(401, "Chưa đăng nhập")
    try:
        uid = int(jwt.decode(raw, SECRET, ["HS256"])["sub"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ") from None
    user = db.get(User, uid)
    if not user:
        raise HTTPException(401, "Tài khoản không tồn tại")
    return user


def teacher(user: User = Depends(current_user)) -> User:
    if user.role != "teacher":
        raise HTTPException(403, "Chỉ giảng viên được thực hiện")
    return user
