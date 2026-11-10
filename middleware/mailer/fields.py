from __future__ import annotations

from cryptography.fernet import InvalidToken
from django.db import models

from .crypto import get_fernet


class EncryptedTextField(models.TextField):
    """A minimal encrypted TextField using Fernet.

    Values are stored as `fernet:<token>` and returned as plaintext when
    read from the database.
    """

    prefix = "fernet:"

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value in (None, ""):
            return value
        if isinstance(value, str) and value.startswith(self.prefix):
            return value
        token = get_fernet().encrypt(str(value).encode("utf-8")).decode("utf-8")
        return f"{self.prefix}{token}"

    def from_db_value(self, value, expression, connection):
        if value in (None, ""):
            return value
        if isinstance(value, str) and value.startswith(self.prefix):
            token = value[len(self.prefix) :]
            try:
                return get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
            except InvalidToken:
                return value
        return value

    def to_python(self, value):
        if value in (None, ""):
            return value
        if isinstance(value, str) and value.startswith(self.prefix):
            token = value[len(self.prefix) :]
            try:
                return get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
            except InvalidToken:
                return value
        return value
