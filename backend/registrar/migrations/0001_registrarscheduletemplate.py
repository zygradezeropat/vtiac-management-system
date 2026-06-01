from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("trainer", "0001_traineraccountrequest"),
    ]

    operations = [
        migrations.CreateModel(
            name="RegistrarScheduleTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("course_id", models.CharField(db_index=True, max_length=80)),
                ("course_name", models.CharField(max_length=200)),
                ("name", models.CharField(blank=True, max_length=200)),
                ("schedule_type", models.CharField(max_length=16)),
                ("days", models.JSONField(default=list)),
                ("time_from", models.CharField(max_length=8)),
                ("time_to", models.CharField(max_length=8)),
                ("daily_hours", models.DecimalField(decimal_places=1, default=0, max_digits=4)),
                ("available_from", models.DateField(blank=True, null=True)),
                ("available_until", models.DateField(blank=True, null=True)),
                ("trainer_name", models.CharField(blank=True, max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="registrar_schedule_templates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "trainer_request",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="schedule_templates",
                        to="trainer.traineraccountrequest",
                    ),
                ),
            ],
            options={"ordering": ["-updated_at", "-created_at"]},
        ),
    ]
