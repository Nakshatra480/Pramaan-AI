"""Public-key Firebase ID token verification (no network, locally generated keys)."""

import time

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from google.auth import crypt, jwt

from app.core.exceptions import Unauthenticated
from app.core.security import FirebasePublicKeyVerifier

PROJECT = "pramaan-ai-prod"


def _keypair(kid: str):  # type: ignore[no-untyped-def]
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = __import__("datetime").datetime.now(__import__("datetime").UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(now)
        .not_valid_after(now + __import__("datetime").timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    pem_key = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    return crypt.RSASigner.from_string(pem_key, key_id=kid), cert.public_bytes(serialization.Encoding.PEM).decode()


SIGNER, CERT = _keypair("kid-1")
OTHER_SIGNER, _ = _keypair("kid-1")  # same kid, different key → forged signature


def token(signer=SIGNER, **overrides) -> str:  # type: ignore[no-untyped-def]
    now = int(time.time())
    claims = {
        "iss": f"https://securetoken.google.com/{PROJECT}",
        "aud": PROJECT,
        "sub": "uid-123",
        "user_id": "uid-123",
        "iat": now - 10,
        "exp": now + 3600,
        "auth_time": now - 10,
        "email": "a@example.com",
        "email_verified": True,
        "firebase": {"sign_in_provider": "google.com"},
    }
    claims.update(overrides)
    return jwt.encode(signer, claims).decode()


@pytest.fixture
def verifier() -> FirebasePublicKeyVerifier:
    v = FirebasePublicKeyVerifier(PROJECT)
    v._certs, v._expires = {"kid-1": CERT}, time.time() + 3600
    return v


async def test_valid_token(verifier: FirebasePublicKeyVerifier) -> None:
    ident = await verifier.verify(token())
    assert ident.uid == "uid-123" and ident.email_verified and ident.provider == "google"


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"aud": "some-other-project"}, "TOKEN_INVALID"),
        ({"iss": "https://securetoken.google.com/some-other-project"}, "TOKEN_INVALID"),
        ({"exp": int(time.time()) - 60, "iat": int(time.time()) - 4000}, "TOKEN_EXPIRED"),
        ({"sub": ""}, "TOKEN_INVALID"),
        ({"auth_time": int(time.time()) + 3600}, "TOKEN_INVALID"),
    ],
)
async def test_rejected_claims(verifier: FirebasePublicKeyVerifier, overrides: dict, code: str) -> None:
    with pytest.raises(Unauthenticated) as e:
        await verifier.verify(token(**overrides))
    assert e.value.code == code


async def test_forged_signature_and_garbage(verifier: FirebasePublicKeyVerifier) -> None:
    for bad in (token(signer=OTHER_SIGNER), "not.a.jwt", token()[:-5] + "AAAAA"):
        with pytest.raises(Unauthenticated):
            await verifier.verify(bad)


def test_requires_project_id() -> None:
    with pytest.raises(RuntimeError):
        FirebasePublicKeyVerifier("")
