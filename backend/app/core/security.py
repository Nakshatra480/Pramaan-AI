"""Firebase ID token verification.

Identity is ONLY ever derived from a verified Firebase ID token. User ids in
request bodies, URLs or headers are never trusted.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import Settings, get_settings
from app.core.exceptions import Unauthenticated

logger = logging.getLogger("pramaan.auth")


@dataclass(frozen=True, slots=True)
class VerifiedIdentity:
    uid: str
    email: str | None
    email_verified: bool
    name: str | None
    picture: str | None
    provider: str


class TokenVerifier(Protocol):
    async def verify(self, token: str) -> VerifiedIdentity: ...


class AppCheckVerifier(Protocol):
    async def verify(self, token: str) -> None: ...


def _identity_from_claims(claims: dict[str, object]) -> VerifiedIdentity:
    firebase = claims.get("firebase") or {}
    provider = firebase.get("sign_in_provider", "password") if isinstance(firebase, dict) else "password"
    return VerifiedIdentity(
        uid=str(claims["uid"]),
        email=claims.get("email") if isinstance(claims.get("email"), str) else None,  # type: ignore[arg-type]
        email_verified=bool(claims.get("email_verified", False)),
        name=claims.get("name") if isinstance(claims.get("name"), str) else None,  # type: ignore[arg-type]
        picture=claims.get("picture") if isinstance(claims.get("picture"), str) else None,  # type: ignore[arg-type]
        provider="google" if provider == "google.com" else "password",
    )


class FirebaseTokenVerifier:
    """Verifies tokens with the Firebase Admin SDK (signature, audience, issuer, expiry).

    Honours FIREBASE_AUTH_EMULATOR_HOST for local development with the Auth Emulator.
    """

    def __init__(self, settings: Settings) -> None:
        import firebase_admin
        from firebase_admin import credentials

        if settings.firebase_auth_emulator_host:
            logger.warning("firebase_auth_emulator_enabled", extra={"fields": {"host": settings.firebase_auth_emulator_host}})

        self.project_id = settings.firebase_project_id
        self.check_revoked = settings.firebase_check_revoked and not settings.firebase_auth_emulator_host
        options = {"projectId": settings.firebase_project_id} if settings.firebase_project_id else None
        if not firebase_admin._apps:
            key = settings.firebase_private_key.get_secret_value().replace("\\n", "\n")
            if settings.firebase_client_email and key:
                cred = credentials.Certificate(
                    {
                        "type": "service_account",
                        "project_id": settings.firebase_project_id,
                        "client_email": settings.firebase_client_email,
                        "private_key": key,
                        "token_uri": "https://oauth2.googleapis.com/token",
                    }
                )
                firebase_admin.initialize_app(cred, options)
            else:
                # Application Default Credentials (e.g. Cloud Run service account).
                firebase_admin.initialize_app(options=options)

    async def verify(self, token: str) -> VerifiedIdentity:
        from firebase_admin import auth

        try:
            claims = await asyncio.to_thread(auth.verify_id_token, token, check_revoked=self.check_revoked, clock_skew_seconds=5)
        except auth.ExpiredIdTokenError as e:
            raise Unauthenticated("Your session has expired. Please sign in again.", code="TOKEN_EXPIRED") from e
        except (auth.RevokedIdTokenError, auth.InvalidIdTokenError, ValueError) as e:
            raise Unauthenticated("Your session is invalid. Please sign in again.", code="TOKEN_INVALID") from e
        except Exception as e:  # certificate fetch errors etc. — never leak details
            logger.warning("token_verification_error", exc_info=e)
            raise Unauthenticated("We couldn't verify your session.", code="TOKEN_UNVERIFIABLE") from e
        if self.project_id and claims.get("aud") != self.project_id:  # defence in depth; the SDK checks this too
            raise Unauthenticated("Your session is invalid. Please sign in again.", code="TOKEN_INVALID")
        return _identity_from_claims(claims)


class FirebasePublicKeyVerifier:
    """Verifies Firebase ID tokens against Google's public signing keys.

    Performs the same checks as the Admin SDK (RS256 signature by a current
    securetoken key, audience = project id, issuer, expiry/issued-at, subject,
    auth_time) but needs no service-account credentials, so it works locally
    and on any host. Keys are cached per their Cache-Control max-age.
    """

    CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

    def __init__(self, project_id: str, clock_skew_s: int = 5) -> None:
        if not project_id:
            raise RuntimeError("FIREBASE_PROJECT_ID is required to verify ID tokens.")
        self.project_id = project_id
        self.issuer = f"https://securetoken.google.com/{project_id}"
        self.skew = clock_skew_s
        self._certs: dict[str, str] = {}
        self._expires = 0.0
        self._lock = asyncio.Lock()

    async def _keys(self) -> dict[str, str]:
        async with self._lock:
            if time.time() < self._expires and self._certs:
                return self._certs
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(self.CERTS_URL)
                r.raise_for_status()
            m = re.search(r"max-age=(\d+)", r.headers.get("cache-control", ""))
            self._certs = r.json()
            self._expires = time.time() + (int(m.group(1)) if m else 3600) - 60
            return self._certs

    async def verify(self, token: str) -> VerifiedIdentity:
        from google.auth import exceptions as gexc
        from google.auth import jwt

        try:
            certs = await self._keys()
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("firebase_certs_unavailable", extra={"fields": {"error": type(e).__name__}})
            raise Unauthenticated("We couldn't verify your session.", code="TOKEN_UNVERIFIABLE") from e
        try:
            claims = jwt.decode(token, certs=certs, audience=self.project_id, clock_skew_in_seconds=self.skew)
        except gexc.MalformedError as e:
            raise Unauthenticated("Your session is invalid. Please sign in again.", code="TOKEN_INVALID") from e
        except (gexc.InvalidValue, gexc.GoogleAuthError, ValueError) as e:
            expired = "expired" in str(e).lower() or "too late" in str(e).lower()
            if expired:
                raise Unauthenticated("Your session has expired. Please sign in again.", code="TOKEN_EXPIRED") from e
            raise Unauthenticated("Your session is invalid. Please sign in again.", code="TOKEN_INVALID") from e
        sub = claims.get("sub")
        if claims.get("iss") != self.issuer or not isinstance(sub, str) or not sub or len(sub) > 128:
            raise Unauthenticated("Your session is invalid. Please sign in again.", code="TOKEN_INVALID")
        if float(claims.get("auth_time", 0)) > time.time() + self.skew:
            raise Unauthenticated("Your session is invalid. Please sign in again.", code="TOKEN_INVALID")
        claims["uid"] = sub
        return _identity_from_claims(claims)


class FirebaseAppCheckVerifier:
    async def verify(self, token: str) -> None:
        from firebase_admin import app_check

        try:
            await asyncio.to_thread(app_check.verify_token, token)
        except Exception as e:
            raise Unauthenticated("App verification failed.", code="APP_CHECK_FAILED") from e


@lru_cache
def get_token_verifier() -> TokenVerifier:
    """Emulator or revocation checks → Admin SDK; otherwise public-key verification (no credentials needed)."""
    s = get_settings()
    if s.firebase_auth_emulator_host or s.firebase_check_revoked:
        return FirebaseTokenVerifier(s)
    return FirebasePublicKeyVerifier(s.firebase_project_id)


@lru_cache
def get_app_check_verifier() -> AppCheckVerifier:
    return FirebaseAppCheckVerifier()
