# Generated manually for TrainerAccountRequest

import uuid

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="TrainerAccountRequest",
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
                (
                    "reference_id",
                    models.CharField(editable=False, max_length=12, unique=True),
                ),
                ("first_name", models.CharField(max_length=100)),
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
                ("password_hash", models.CharField(max_length=128)),
                ("qualifications", models.JSONField(default=list)),
                ("other_qualification", models.CharField(blank=True, max_length=200)),
                ("highest_tesda_nc", models.CharField(max_length=128)),
                (
                    "years_experience",
                    models.CharField(
                        choices=[
                            ("lt_1", "Less than 1 year"),
                            ("1_3", "1–3 years"),
                            ("4_6", "4–6 years"),
                            ("7_10", "7–10 years"),
                            ("gt_10", "More than 10 years"),
                        ],
                        max_length=16,
                    ),
                ),
                ("remarks", models.TextField(blank=True)),
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
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
