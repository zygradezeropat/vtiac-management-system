from django.conf import settings
from django.db import models

from backend.trainer.models import TrainerAccountRequest


class RegistrarScheduleTemplate(models.Model):
    """Schedule batch/template created by registrar per course (draft → finalized)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FINALIZED = "finalized", "Finalized"

    course_id = models.CharField(max_length=80, db_index=True)
    course_name = models.CharField(max_length=200)
    name = models.CharField(max_length=200, blank=True)
    schedule_type = models.CharField(max_length=16)
    days = models.JSONField(default=list)
    time_from = models.CharField(max_length=8)
    time_to = models.CharField(max_length=8)
    daily_hours = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    available_from = models.DateField(null=True, blank=True)
    available_until = models.DateField(null=True, blank=True)
    assessment_at = models.DateTimeField(null=True, blank=True)
    examiner_name = models.CharField(max_length=150, blank=True)
    examination_course = models.CharField(max_length=200, blank=True)
    trainer_request = models.ForeignKey(
        TrainerAccountRequest,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="schedule_templates",
    )
    trainer_name = models.CharField(max_length=150, blank=True)
    batch_label = models.CharField(max_length=64, default="Batch 1")
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    finalized_at = models.DateTimeField(null=True, blank=True)
    students_snapshot = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="registrar_schedule_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-created_at"]

    def __str__(self):
        return f"{self.course_name} · {self.name or self.pk}"
