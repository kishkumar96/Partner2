from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

import msal
import requests
from django.conf import settings

from .models import MailConfiguration


@dataclass(frozen=True)
class GraphSendResult:
    ok: bool
    status_code: int
    response_text: str


class SPCMailer:
    @staticmethod
    def get_default_configuration() -> MailConfiguration:
        name = getattr(settings, "MAILER_DEFAULT_CONFIGURATION_NAME", None)
        queryset = MailConfiguration.objects.filter(is_active=True)
        if name:
            try:
                return queryset.get(name=name)
            except MailConfiguration.DoesNotExist as exc:
                raise RuntimeError(
                    f"No active MailConfiguration found with name={name!r}"
                ) from exc

        configs = list(queryset.order_by("id")[:2])
        if len(configs) == 1:
            return configs[0]
        if len(configs) == 0:
            raise RuntimeError("No active MailConfiguration exists")
        raise RuntimeError(
            "Multiple active MailConfigurations exist; set MAILER_DEFAULT_CONFIGURATION_NAME"
        )

    @staticmethod
    def send_notification_email_sync(to: str, subject: str, body: str) -> bool:
        config = SPCMailer.get_default_configuration()
        to_emails = [email.strip() for email in (to or "").split(",") if email.strip()]
        result = SPCMailer.send_with_config_sync(
            config, subject=subject, body=body, to_emails=to_emails
        )
        if not result.ok:
            raise RuntimeError(result.response_text)
        return True

    @staticmethod
    def send_with_config_sync(
        config: MailConfiguration,
        *,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        to_emails: Optional[Iterable[str]] = None,
        timeout_seconds: int = 30,
    ) -> GraphSendResult:
        if not config.is_active:
            raise ValueError("Mail configuration is inactive")

        subject = subject or config.subject
        body = body or config.body
        if not subject or not body:
            raise ValueError("Email subject/body cannot be empty")

        if to_emails is None:
            to_emails = list(
                config.recipients.filter(is_active=True).values_list("email", flat=True)
            )
        to_emails = [email.strip() for email in to_emails if str(email).strip()]
        if not to_emails:
            raise ValueError("No recipients specified")

        client_secret = config.client_secret_value
        if not client_secret:
            raise ValueError("MailConfiguration.client_secret_value is empty")
        # If decryption fails, EncryptedTextField returns the raw stored token.
        # Fail fast with a clear message instead of sending a confusing MSAL error.
        if isinstance(client_secret, str) and client_secret.startswith("fernet:"):
            raise RuntimeError(
                "MailConfiguration.client_secret_value could not be decrypted. "
                "Ensure MAIL_CONFIG_ENCRYPTION_KEY (or DJANGO_SECRET_KEY) matches the key used when the secret was saved, "
                "or re-save the secret in the admin UI to re-encrypt it with the current key."
            )

        app = msal.ConfidentialClientApplication(
            config.client_id,
            authority=config.authority_url,
            client_credential=client_secret,
        )
        scopes = ["https://graph.microsoft.com/.default"]
        result = app.acquire_token_for_client(scopes=scopes)
        if "access_token" not in result:
            raise RuntimeError(
                f"Could not acquire access token: {result.get('error_description', result)}"
            )
        access_token = result["access_token"]

        recip = [{"EmailAddress": {"Address": email}} for email in to_emails]

        email_msg = {
            "Message": {
                "Subject": subject,
                "Body": {"ContentType": "Html", "Content": body},
                "ToRecipients": recip,
                "From": {
                    "EmailAddress": {
                        "Address": config.email_sender,
                        "Name": config.email_sender_name or config.email_sender,
                    }
                },
            },
            "SaveToSentItems": "true",
        }

        user_id = config.email_sender
        endpoint = f"https://graph.microsoft.com/v1.0/users/{user_id}/sendMail"
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.post(
            endpoint, headers=headers, json=email_msg, timeout=timeout_seconds
        )
        if not response.ok:
            return GraphSendResult(
                ok=False, status_code=response.status_code, response_text=response.text
            )
        return GraphSendResult(ok=True, status_code=response.status_code, response_text=response.text)
