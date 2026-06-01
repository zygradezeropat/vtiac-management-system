# Generated for proof of payment uploads

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0005_schedule_options"),
    ]

    operations = [
        migrations.CreateModel(
            name="StudentPaymentProof",
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
                ("file", models.FileField(upload_to="students/payment_proofs/%Y/%m/")),
                ("original_filename", models.CharField(blank=True, max_length=255)),
                ("reference_note", models.CharField(blank=True, max_length=128)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                (
                    "profile",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_proofs",
                        to="student.studentenrollmentprofile",
                    ),
                ),
            ],
            options={
                "db_table": "student_paymentproof",
                "ordering": ["-uploaded_at"],
            },
        ),
    ]
