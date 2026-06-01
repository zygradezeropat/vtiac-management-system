import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_move_student_models_to_student_app"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PortalNotification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("enrollment_requirements", "Enrollment requirements"),
                            ("document_approved", "Document approved"),
                            ("document_rejected", "Document rejected"),
                            ("documents_released", "Documents released"),
                            ("general", "General"),
                        ],
                        db_index=True,
                        default="general",
                        max_length=32,
                    ),
                ),
                ("title", models.CharField(max_length=200)),
                ("message", models.TextField()),
                ("link_url", models.CharField(blank=True, max_length=500)),
                ("read_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("related_profile_id", models.PositiveIntegerField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="portal_notifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["user", "-created_at"], name="core_portal_user_id_created_idx"),
                    models.Index(fields=["user", "read_at"], name="core_portal_user_id_read_idx"),
                ],
            },
        ),
    ]
