from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

phone_ph = RegexValidator(
    regex=r"^09\d{9}$",
    message="Enter a valid Philippine mobile number (09XXXXXXXXX).",
)


class StaffProfile(models.Model):
    """One staff portal role per Django user (registrar, cashier, trainer, admin)."""

    class Role(models.TextChoices):
        REGISTRAR = "registrar", "Registrar"
        CASHIER = "cashier", "Cashier"
        TRAINER = "trainer", "Trainer"
        ADMIN = "admin", "Admin"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
    )
    role = models.CharField(max_length=20, choices=Role.choices, db_index=True)

    class Meta:
        verbose_name = "Staff profile"
        verbose_name_plural = "Staff profiles"

    def __str__(self):
        return f"{self.user.email} ({self.get_role_display()})"


class StaffAccountProfile(models.Model):
    """Contact and address details for staff portal settings."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_account_profile",
    )
    phone_number = models.CharField(max_length=32, blank=True)
    region_code = models.CharField(max_length=32, blank=True)
    province_code = models.CharField(max_length=32, blank=True)
    city_code = models.CharField(max_length=32, blank=True)
    barangay_code = models.CharField(max_length=32, blank=True)
    street_house = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Staff account profile"
        verbose_name_plural = "Staff account profiles"

    def __str__(self):
        return f"Profile for {self.user_id}"


class PortalNotification(models.Model):
    """In-app notification for any portal user (student or staff)."""

    class Category(models.TextChoices):
        ENROLLMENT_REQUIREMENTS = "enrollment_requirements", "Enrollment requirements"
        DOCUMENT_APPROVED = "document_approved", "Document approved"
        DOCUMENT_REJECTED = "document_rejected", "Document rejected"
        DOCUMENTS_RELEASED = "documents_released", "Documents released"
        PAYMENT_RECEIVED = "payment_received", "Payment received"
        GENERAL = "general", "General"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="portal_notifications",
    )
    category = models.CharField(
        max_length=32,
        choices=Category.choices,
        default=Category.GENERAL,
        db_index=True,
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    link_url = models.CharField(max_length=500, blank=True)
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    related_profile_id = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "read_at"]),
        ]

    def __str__(self):
        return f"{self.title} → {self.user_id}"

    @property
    def is_read(self):
        return self.read_at is not None
