import secrets
import uuid

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

phone_ph = RegexValidator(
    regex=r"^09\d{9}$",
    message="Enter a valid Philippine mobile number (11 digits, starting with 09).",
)


class TrainerAccountRequest(models.Model):
    """Public trainer portal account request (pending registrar approval)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class ExperienceRange(models.TextChoices):
        LT_1 = "lt_1", "Less than 1 year"
        Y1_3 = "1_3", "1–3 years"
        Y4_6 = "4_6", "4–6 years"
        Y7_10 = "7_10", "7–10 years"
        GT_10 = "gt_10", "More than 10 years"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference_id = models.CharField(max_length=12, unique=True, editable=False)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=11, validators=[phone_ph])
    password_hash = models.CharField(max_length=128)
    qualifications = models.JSONField(default=list)
    other_qualification = models.CharField(max_length=200, blank=True)
    highest_tesda_nc = models.CharField(max_length=128)
    years_experience = models.CharField(max_length=16, choices=ExperienceRange.choices)
    remarks = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference_id:
            self.reference_id = secrets.token_hex(4).upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference_id} — {self.last_name}, {self.first_name}"


class TrainerStudentGrade(models.Model):
    """Trainer-entered grades per student (UC scores, outcomes, assessment)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trainer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trainer_student_grades",
    )
    student_key = models.CharField(max_length=128)
    student_name = models.CharField(max_length=200)
    program = models.CharField(max_length=200)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["trainer", "student_key"],
                name="uniq_trainer_student_grade",
            )
        ]

    def __str__(self):
        return f"{self.student_name} — {self.program}"
