import os, base64, hashlib, hmac, secrets
from datetime import datetime, timedelta, timezone
import jwt

ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    iterations = 210_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"

def verify_password(password: str, encoded: str) -> bool:
    try:
        _, iterations, salt_b64, digest_b64 = encoded.split("$")
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def create_token(user_id: str, email: str, role: str):
    secret = os.getenv("JWT_SECRET", "dev-secret-change-me")
    exp = datetime.now(timezone.utc) + timedelta(minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES","1440")))
    return jwt.encode({"sub": user_id, "email": email, "role": role, "exp": exp}, secret, algorithm=ALGORITHM)

def decode_token(token: str):
    secret = os.getenv("JWT_SECRET", "dev-secret-change-me")
    return jwt.decode(token, secret, algorithms=[ALGORITHM])
