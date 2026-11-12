from decimal import Decimal

from django.conf import settings
from django.db import models

from .defaults import (
    DEFAULT_FISCAL_YEAR_LABEL,
    DEFAULT_REGISTRATION_FEE,
    DEFAULT_PROGRAMS,
    DEFAULT_SCHEDULES,
    DEFAULT_PROGRAM_COMPETENCIES,
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


class ProgramCompetency(models.Model):
    class Category(models.TextChoices):
        BASIC = "basic", "Basic Competencies"
        COMMON = "common", "Common Competencies"
        CORE = "core", "Core Competencies"

    program = models.ForeignKey(
        NcProgram,
        on_delete=models.CASCADE,
        related_name="competencies",
    )
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.CORE,
        db_index=True,
    )
    code = models.CharField(max_length=80, blank=True)
    title = models.CharField(max_length=255)
    nominal_hours = models.PositiveIntegerField(default=0, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    learning_outcomes = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "sort_order", "id"]

    def __str__(self):
        return f"{self.program.name} — [{self.get_category_display()}] {self.code} {self.title}"


class TrainingSchedule(models.Model):
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
    singleton_key = models.CharField(max_length=1, default="X", unique=True, editable=False)
    fiscal_year_label = models.CharField(max_length=32, default=DEFAULT_FISCAL_YEAR_LABEL)
    registration_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=DEFAULT_REGISTRATION_FEE,
    )
    enrollment_open = models.BooleanField(default=True)
    evaluation_enabled = models.BooleanField(default=False)
    evaluation_start_date = models.DateField(null=True, blank=True)
    evaluation_end_date = models.DateField(null=True, blank=True)
    evaluation_instructions = models.TextField(blank=True, default="")
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

    @property
    def is_evaluation_open(self) -> bool:
        if not self.evaluation_start_date or not self.evaluation_end_date:
            return False
        from django.utils import timezone
        today = timezone.localdate()
        return self.evaluation_start_date <= today <= self.evaluation_end_date

    def get_evaluation_status(self) -> dict:
        from django.utils import timezone
        today = timezone.localdate()
        start = self.evaluation_start_date
        end = self.evaluation_end_date

        if not start or not end:
            return {
                "is_open": False,
                "status": "disabled",
                "badge_class": "bg-secondary",
                "badge_text": "No Schedule Set",
                "message": "Trainer evaluation is currently disabled. Please set an evaluation schedule.",
                "start_date": "",
                "end_date": "",
                "formatted_period": "No schedule set",
                "enabled": False,
            }

        start_str = start.strftime("%B %d, %Y")
        end_str = end.strftime("%B %d, %Y")
        period_str = f"{start_str} – {end_str}"

        if today < start:
            return {
                "is_open": False,
                "status": "upcoming",
                "badge_class": "bg-info text-dark",
                "badge_text": "Upcoming",
                "message": f"Trainer evaluation is scheduled to open on {start_str}.",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "formatted_period": period_str,
                "enabled": True,
            }
        elif today > end:
            return {
                "is_open": False,
                "status": "closed",
                "badge_class": "bg-danger",
                "badge_text": "Closed",
                "message": f"Trainer evaluation period ended on {end_str}.",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "formatted_period": period_str,
                "enabled": True,
            }
        else:
            return {
                "is_open": True,
                "status": "open",
                "badge_class": "bg-success",
                "badge_text": "Open / Active",
                "message": f"Trainer evaluation is currently open until {end_str}.",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "formatted_period": period_str,
                "enabled": True,
            }

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(singleton_key="X")
        return obj


def seed_default_programs():
    for name, fee, sort_order in DEFAULT_PROGRAMS:
        program, _ = NcProgram.objects.get_or_create(
            name=name,
            defaults={
                "training_fee": fee,
                "sort_order": sort_order,
                "is_active": True,
            },
        )
        if not program.competencies.exists():
            default_comps = DEFAULT_PROGRAM_COMPETENCIES.get(name) or {}
            to_create = []
            for cat_key, units in default_comps.items():
                for idx, u in enumerate(units, start=1):
                    to_create.append(
                        ProgramCompetency(
                            program=program,
                            category=cat_key,
                            code=u.get("code") or "",
                            title=u.get("title") or "",
                            nominal_hours=u.get("nominal_hours") or 0,
                            sort_order=idx,
                            learning_outcomes=u.get("learning_outcomes") or [],
                            is_active=True,
                        )
                    )
            if to_create:
                ProgramCompetency.objects.bulk_create(to_create)


def seed_default_schedules():
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

