# Move StudentProfile and StudentRegistration from core → student (state only; keep DB tables).

import django.core.validators
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0003_studentprofile_studentregistration_user"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="StudentProfile",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(
                                auto_created=True,
                                primary_key=True,
                                serialize=False,
                                verbose_name="ID",
                            ),
                        ),
                        (
                            "user",
                            models.OneToOneField(
                                on_delete=django.db.models.deletion.CASCADE,
                                related_name="student_profile",
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                    ],
                    options={
                        "verbose_name": "Student profile",
                        "verbose_name_plural": "Student profiles",
                        "db_table": "core_studentprofile",
                    },
                ),
                migrations.CreateModel(
                    name="StudentRegistration",
                    fields=[
                        (
                            "id",
                            models.UUIDField(
                                default=uuid.uuid4,
                                editable=False,
                                primary_key=True,
                                serialize=False,
                            ),
                        ),
                        ("reference_id", models.CharField(editable=False, max_length=12, unique=True)),
                        ("first_name", models.CharField(max_length=100)),
                        ("middle_name", models.CharField(blank=True, max_length=100)),
                        ("last_name", models.CharField(max_length=100)),
                        ("email", models.EmailField(max_length=254, unique=True)),
                        (
                            "phone_number",
                            models.CharField(
                                max_length=11,
                                validators=[
                                    django.core.validators.RegexValidator(
                                        message="Enter a valid Philippine mobile number (11 digits, starting with 09).",
                                        regex="^09\\d{9}$",
                                    )
                                ],
                            ),
                        ),
                        ("region_code", models.CharField(max_length=32)),
                        ("province_code", models.CharField(max_length=32)),
                        ("city_code", models.CharField(max_length=32)),
                        ("barangay_code", models.CharField(max_length=32)),
                        ("zip_code", models.CharField(blank=True, max_length=16)),
                        ("street_house", models.CharField(blank=True, max_length=255)),
                        ("birth_date", models.DateField()),
                        (
                            "gender",
                            models.CharField(
                                choices=[("male", "Male"), ("female", "Female")],
                                max_length=16,
                            ),
                        ),
                        (
                            "civil_status",
                            models.CharField(
                                choices=[
                                    ("single", "Single"),
                                    ("married", "Married"),
                                    ("widowed", "Widowed"),
                                    ("separated", "Separated"),
                                ],
                                max_length=16,
                            ),
                        ),
                        ("educational_attainment", models.CharField(blank=True, max_length=128)),
                        ("emergency_name", models.CharField(max_length=150)),
                        (
                            "emergency_phone",
                            models.CharField(
                                max_length=11,
                                validators=[
                                    django.core.validators.RegexValidator(
                                        message="Enter a valid Philippine mobile number (11 digits, starting with 09).",
                                        regex="^09\\d{9}$",
                                    )
                                ],
                            ),
                        ),
                        (
                            "program_type",
                            models.CharField(
                                choices=[
                                    ("training_with_assessment", "Training with Assessment"),
                                    ("assessment_only", "Assessment Only"),
                                ],
                                max_length=40,
                            ),
                        ),
                        ("selected_program", models.CharField(max_length=200)),
                        (
                            "status",
                            models.CharField(
                                choices=[
                                    ("pending", "Pending"),
                                    ("approved", "Approved"),
                                    ("rejected", "Rejected"),
                                ],
                                db_index=True,
                                default="pending",
                                max_length=20,
                            ),
                        ),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        (
                            "user",
                            models.OneToOneField(
                                blank=True,
                                null=True,
                                on_delete=django.db.models.deletion.CASCADE,
                                related_name="registration_application",
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                    ],
                    options={
                        "db_table": "core_studentregistration",
                        "ordering": ["-created_at"],
                    },
                ),
            ],
        ),
    ]
