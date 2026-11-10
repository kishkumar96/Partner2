from django import forms
from django.contrib import admin

from .models import MailConfiguration, MailRecipient


class MailConfigurationAdminForm(forms.ModelForm):
    client_secret_value = forms.CharField(
        required=False,
        widget=forms.PasswordInput(render_value=False),
        help_text="Leave blank to keep the existing secret.",
    )

    class Meta:
        model = MailConfiguration
        fields = "__all__"

    def clean_client_secret_value(self):
        value = (self.cleaned_data.get("client_secret_value") or "").strip()
        if value:
            return value
        if self.instance and self.instance.pk:
            return self.instance.client_secret_value
        raise forms.ValidationError("This field is required.")


@admin.register(MailRecipient)
class MailRecipientAdmin(admin.ModelAdmin):
    list_display = ("email", "name", "is_active", "created_at")
    search_fields = ("email", "name")
    #list_filter = ("is_active",)


@admin.register(MailConfiguration)
class MailConfigurationAdmin(admin.ModelAdmin):
    form = MailConfigurationAdminForm
    list_display = ("name", "is_active", "email_sender", "updated_at")
    search_fields = ("name", "email_sender")
    #list_filter = ("is_active",)
    filter_horizontal = ("recipients",)
