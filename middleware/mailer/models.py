from django.db import models

from .fields import EncryptedTextField


class MailRecipient(models.Model):
    name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.email


class MailConfiguration(models.Model):
    name = models.CharField(max_length=120, unique=True)
    is_active = models.BooleanField(default=True)

    client_id = models.CharField(max_length=255)
    authority_url = models.URLField(max_length=500)
    client_secret_value = EncryptedTextField()

    email_sender = models.EmailField()
    email_sender_name = models.CharField(max_length=255, blank=True)

    subject = models.CharField(max_length=255)
    body = models.TextField(help_text="HTML body")

    recipients = models.ManyToManyField(MailRecipient, blank=True, related_name="mail_configurations")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name
