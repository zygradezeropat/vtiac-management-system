from decimal import Decimal

from django.conf import settings
from django.db import models

from .defaults import (
    DEFAULT_FISCAL_YEAR_LABEL,
    DEFAULT_REGISTRATION_FEE,
    DEFAULT_PROGRAMS,
    DEFAULT_SCHEDULES,
)


class NcProgram(models.Model):
    """NC program offered for enrollment — managed from the admin portal."""

    name = models.CharField(max_length=200, unique=True)
    training_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class TrainingSchedule(models.Model):
    """Training schedule option — managed from the admin portal and selected by students during registration."""

    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(max_length=80, blank=True)
    days = models.CharField(max_length=120, blank=True)
    time_slot = models.CharField(max_length=120, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class SystemSettings(models.Model):
    """Singleton row for portal-wide configuration."""

    singleton_key = models.CharField(max_length=1, default="X", unique=True, editable=False)
    fiscal_year_label = models.CharField(max_length=32, default=DEFAULT_FISCAL_YEAR_LABEL)
    registration_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=DEFAULT_REGISTRATION_FEE,
    )
    enrollment_open = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="system_settings_updates",
    )

    class Meta:
        verbose_name_plural = "System settings"

    def __str__(self):
        return "Portal system settings"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(singleton_key="X")
        return obj


def seed_default_programs():
    """Ensure default NC programs exist (idempotent)."""
    if NcProgram.objects.exists():
        return
    NcProgram.objects.bulk_create(
        [
            NcProgram(
                name=name,
                training_fee=fee,
                sort_order=sort_order,
                is_active=True,
            )
            for name, fee, sort_order in DEFAULT_PROGRAMS
        ]
    )


def seed_default_schedules():
    """Ensure default training schedule options exist (idempotent)."""
    if TrainingSchedule.objects.exists():
        return
    TrainingSchedule.objects.bulk_create(
        [
            TrainingSchedule(
                name=name,
                code=code,
                days=days,
                time_slot=time_slot,
                sort_order=sort_order,
                is_active=True,
            )
            for name, code, days, time_slot, sort_order in DEFAULT_SCHEDULES
        ]
    )

