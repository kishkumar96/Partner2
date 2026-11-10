import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet
from django.conf import settings


def _derive_fernet_key(key_material: str) -> bytes:
    digest = hashlib.sha256(key_material.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet() -> Fernet:
    key_material: Optional[str] = getattr(settings, "MAIL_CONFIG_ENCRYPTION_KEY", None)
    if not key_material:
        key_material = settings.SECRET_KEY
    return Fernet(_derive_fernet_key(key_material))
