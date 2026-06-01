import os
import re
import secrets
import uuid

from django.conf import settings
from django.utils.text import get_valid_filename
from django.core.validators import RegexValidator
from django.db import models

phone_ph = RegexValidator(
    regex=r"^09\d{9}$",
    message="Enter a valid Philippine mobile number.",
)


def _enrollment_media_folder(last_name):
    """Folder under MEDIA_ROOT named from the student's last name."""
    name = (last_name or "").strip()
    if not name:
        return "student"
    cleaned = re.sub(r"[^\w\s-]", "", name, flags=re.UNICODE)
    cleaned = re.sub(r"\s+", "_", cleaned).strip("_")
    return cleaned or "student"


def enrollment_photo_upload_to(instance, filename):
    folder = _enrollment_media_folder(instance.last_name)
    return f"{folder}/{get_valid_filename(os.path.basename(filename))}"


class StudentProfile(models.Model):
    # Login profile for students who register through the js wizard.

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )

    class Meta:
        db_table = "core_studentprofile"
        verbose_name = "Student profile"
        verbose_name_plural = "Student profiles"

    def __str__(self):
        return f"{self.user.email} (Student)"


class StudentRegistration(models.Model):
    """Public registration application and student details."""

    class ProgramType(models.TextChoices):
        TRAINING_WITH_ASSESSMENT = "training_with_assessment", "Training with Assessment"
        ASSESSMENT_ONLY = "assessment_only", "Assessment Only"

    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"

    class CivilStatus(models.TextChoices):
        SINGLE = "single", "Single"
        MARRIED = "married", "Married"
        WIDOWED = "widowed", "Widow/er"
        SEPARATED = "separated", "Separated / Divorced / Annulled"
        COMMON_LAW = "common_law", "Common Law / Live-in"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class PreferredSchedule(models.TextChoices):
        MON_FRI_8_5 = "mon_fri_8_5", "Mondays - Fridays (8am - 5pm)"
        SAT_SUN_8_5 = "sat_sun_8_5", "Saturdays - Sundays (8am - 5pm)"
        MON_FRI_5_9 = "mon_fri_5_9", "Mondays - Fridays (5pm - 9pm)"
        SAT_SUN_5_9 = "sat_sun_5_9", "Saturdays - Sundays (5pm - 9pm)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference_id = models.CharField(max_length=12, unique=True, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="registration_application",
        null=True,
        blank=True,
    )

    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=11, validators=[phone_ph])

    region_code = models.CharField(max_length=32)
    province_code = models.CharField(max_length=32)
    city_code = models.CharField(max_length=32)
    barangay_code = models.CharField(max_length=32)
    zip_code = models.CharField(max_length=16, blank=True)
    street_house = models.CharField(max_length=255, blank=True)

    birth_date = models.DateField()
    gender = models.CharField(max_length=16, choices=Gender.choices)
    civil_status = models.CharField(max_length=16, choices=CivilStatus.choices)
    educational_attainment = models.CharField(max_length=128, blank=True)

    emergency_name = models.CharField(max_length=150)
    emergency_phone = models.CharField(max_length=11, validators=[phone_ph])

    program_type = models.CharField(max_length=40, choices=ProgramType.choices)
    selected_program = models.CharField(max_length=200)
    preferred_schedule = models.CharField(
        max_length=32,
        choices=PreferredSchedule.choices,
        blank=True,
    )

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_studentregistration"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference_id:
            self.reference_id = secrets.token_hex(4).upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference_id} — {self.last_name}, {self.first_name}"


class StudentEnrollmentProfile(models.Model):
    """TESDA learner profile (Step 1) submitted from the student enrollment portal."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="enrollment_profile",
    )
    registration = models.OneToOneField(
        StudentRegistration,
        on_delete=models.CASCADE,
        related_name="tesda_profile",
        null=True,
        blank=True,
    )

    tsmis = models.CharField(max_length=32, blank=True)
    uli = models.CharField(max_length=64, blank=True)
    entry_date = models.DateField()

    last_name = models.CharField(max_length=100)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    name_extension = models.CharField(max_length=16, blank=True)
    email = models.EmailField()
    contact_number = models.CharField(max_length=11, validators=[phone_ph])

    region_code = models.CharField(max_length=32)
    province_code = models.CharField(max_length=32)
    city_code = models.CharField(max_length=32)
    barangay_code = models.CharField(max_length=32)
    street_house = models.CharField(max_length=255, blank=True)
    district = models.CharField(max_length=128, blank=True)
    nationality = models.CharField(max_length=64, default="Filipino")

    sex = models.CharField(max_length=16, choices=StudentRegistration.Gender.choices)
    civil_status = models.CharField(
        max_length=32, choices=StudentRegistration.CivilStatus.choices, blank=True
    )
    employment_status = models.CharField(max_length=32, blank=True)
    employment_type = models.CharField(max_length=32, blank=True)
    birth_date = models.DateField()
    birthplace = models.CharField(max_length=255, blank=True)
    educational_attainment = models.CharField(max_length=128, blank=True)

    parent_guardian_name = models.CharField(max_length=150, blank=True)
    parent_guardian_address = models.CharField(max_length=255, blank=True)

    client_classifications = models.JSONField(default=list, blank=True)
    disability_types = models.JSONField(default=list, blank=True)
    disability_other_specify = models.CharField(max_length=255, blank=True)
    disability_causes = models.JSONField(default=list, blank=True)
    selected_program = models.CharField(max_length=200)
    program_type = models.CharField(max_length=40, choices=StudentRegistration.ProgramType.choices)
    scholarship_type = models.CharField(max_length=32, blank=True)

    privacy_consent = models.BooleanField(default=False)
    signature = models.CharField(max_length=255)
    date_accomplished = models.DateField(null=True, blank=True)
    noted_by = models.CharField(
        max_length=255,
        blank=True,
        help_text="Registrar / school administrator signature (staff only).",
    )
    date_received = models.DateField(
        null=True,
        blank=True,
        help_text="Date the form was received at the office (staff only).",
    )
    photo = models.FileField(upload_to=enrollment_photo_upload_to, blank=True)
    assessment_application_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="TESDA Application Form fields for assessment-only enrollees.",
    )

    class PhotoRegistrarStatus(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    profile_step_completed = models.BooleanField(default=True)
    requirements_submitted = models.BooleanField(default=False)
    requirements_submitted_at = models.DateTimeField(null=True, blank=True)
    photo_registrar_status = models.CharField(
        max_length=16,
        choices=PhotoRegistrarStatus.choices,
        default=PhotoRegistrarStatus.PENDING,
        blank=True,
    )
    photo_rejection_reason = models.CharField(max_length=500, blank=True)
    documents_review_released = models.BooleanField(
        default=False,
        help_text="Registrar approved all documents; student may proceed to payment.",
    )
    documents_review_released_at = models.DateTimeField(null=True, blank=True)
    preferred_schedule = models.ForeignKey(
        "StudentScheduleOption",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="selected_by_profiles",
    )
    schedule_selected_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "student_enrollmentprofile"
        verbose_name = "Student enrollment profile"
        verbose_name_plural = "Student enrollment profiles"

    def __str__(self):
        return f"Enrollment profile — {self.last_name}, {self.first_name}"


class StudentEnrollmentDocument(models.Model):
    """Uploaded enrollment requirement (Step 2)."""

    class DocumentType(models.TextChoices):
        BIRTH_CERTIFICATE = "birth_certificate", "Birth Certificate"
        VALID_ID = "valid_id", "Valid ID"
        PHOTO_2X2 = "photo_2x2", "2x2 Photo"
        GOOD_MORAL = "good_moral", "Certificate of Good Moral"
        TRANSCRIPT = "transcript", "Transcript of Records"

    profile = models.ForeignKey(
        StudentEnrollmentProfile,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    document_type = models.CharField(max_length=32, choices=DocumentType.choices)
    file = models.FileField(upload_to="students/enrollment_documents/%Y/%m/")
    id_type = models.CharField(max_length=64, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now=True)
    registrar_status = models.CharField(
        max_length=16,
        choices=StudentEnrollmentProfile.PhotoRegistrarStatus.choices,
        default=StudentEnrollmentProfile.PhotoRegistrarStatus.PENDING,
    )
    rejection_reason = models.CharField(max_length=500, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "student_enrollmentdocument"
        constraints = [
            models.UniqueConstraint(
                fields=["profile", "document_type"],
                name="unique_profile_document_type",
            )
        ]
        ordering = ["document_type"]

    def __str__(self):
        return f"{self.get_document_type_display()} — {self.profile}"


class StudentPaymentProof(models.Model):
    """Payment receipt or transaction screenshot uploaded from the payments panel."""

    profile = models.ForeignKey(
        StudentEnrollmentProfile,
        on_delete=models.CASCADE,
        related_name="payment_proofs",
    )
    file = models.FileField(upload_to="students/payment_proofs/%Y/%m/")
    original_filename = models.CharField(max_length=255, blank=True)
    reference_note = models.CharField(max_length=128, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "student_paymentproof"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"Payment proof — {self.profile}"


class StudentScheduleOption(models.Model):
    """Class schedule option assigned by the registrar (batching & scheduling)."""

    profile = models.ForeignKey(
        StudentEnrollmentProfile,
        on_delete=models.CASCADE,
        related_name="schedule_options",
    )
    label = models.CharField(max_length=120)
    day = models.CharField(max_length=64)
    time_from = models.CharField(max_length=8)
    time_to = models.CharField(max_length=8)
    batch_label = models.CharField(max_length=64, blank=True)
    course_name = models.CharField(max_length=200, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    trainer = models.CharField(max_length=150, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    assigned_by = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "student_scheduleoption"
        ordering = ["sort_order", "created_at"]

    def __str__(self):
        return f"{self.label} — {self.profile}"
