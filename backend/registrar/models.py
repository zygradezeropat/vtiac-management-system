import uuid
from django.conf import settings
from django.db import models

from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from backend.trainer.models import TrainerAccountRequest


class RegistrarScheduleTemplate(models.Model):
    """Schedule batch/template created by registrar per course (draft → finalized)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"

    class BatchKind(models.TextChoices):
        TRAINING = "training", "Training"
        NATIONAL_ASSESSMENT = "national_assessment", "National assessment"

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
    batch_kind = models.CharField(
        max_length=32,
        choices=BatchKind.choices,
        default=BatchKind.TRAINING,
        db_index=True,
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    is_active = models.BooleanField(default=False)
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


class ScholarshipGrantBatch(models.Model):
    """Log of uploaded sponsor list batches (Excel / PDF imports)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sponsor_name = models.CharField(max_length=200)
    filename = models.CharField(max_length=255, blank=True)
    total_parsed_rows = models.PositiveIntegerField(default=0)
    matched_count = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scholarship_batches",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "registrar_scholarshipgrantbatch"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.sponsor_name} ({self.created_at.strftime('%Y-%m-%d')})"


class ScholarGrantRecord(models.Model):
    """Specific scholarship grant record imported from sponsor list."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(
        ScholarshipGrantBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grant_records",
    )
    profile = models.ForeignKey(
        StudentEnrollmentProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scholarship_grants",
    )
    registration = models.ForeignKey(
        StudentRegistration,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scholarship_grants",
    )
    no = models.CharField(max_length=64, blank=True, null=True)
    last_name = models.CharField(max_length=150, blank=True, null=True)
    first_name = models.CharField(max_length=150, blank=True, null=True)
    middle_name = models.CharField(max_length=150, blank=True, null=True)
    scholar_name = models.CharField(max_length=200, blank=True, null=True)
    birthdate = models.CharField(max_length=64, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    email = models.CharField(max_length=254, blank=True, null=True)
    program = models.CharField(max_length=200, blank=True, null=True)
    sponsor_name = models.CharField(max_length=200, blank=True, null=True)
    slot_id = models.CharField(max_length=64, blank=True, null=True)
    amount = models.CharField(max_length=64, blank=True, null=True)
    scholarship_type = models.CharField(max_length=32, default="tesda", blank=True, null=True)
    granted_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "registrar_scholargrantrecord"
        ordering = ["-granted_at"]

    def __str__(self):
        name = self.scholar_name or f"{self.first_name or ''} {self.last_name or ''}".strip() or "Unnamed Scholar"
        return f"{name} — {self.sponsor_name or 'Grant'} ({self.slot_id or 'No Slot'})"

