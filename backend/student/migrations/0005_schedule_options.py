# Generated manually for schedule assignment feature

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0004_enrollment_documents"),
    ]

    operations = [
        migrations.CreateModel(
            name="StudentScheduleOption",
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
                ("label", models.CharField(max_length=120)),
                ("day", models.CharField(max_length=64)),
                ("time_from", models.CharField(max_length=8)),
                ("time_to", models.CharField(max_length=8)),
                ("batch_label", models.CharField(blank=True, max_length=64)),
                ("course_name", models.CharField(blank=True, max_length=200)),
                ("start_date", models.DateField(blank=True, null=True)),
                ("end_date", models.DateField(blank=True, null=True)),
                ("trainer", models.CharField(blank=True, max_length=150)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("assigned_by", models.CharField(blank=True, max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "profile",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="schedule_options",
                        to="student.studentenrollmentprofile",
                    ),
                ),
            ],
            options={
                "db_table": "student_scheduleoption",
                "ordering": ["sort_order", "created_at"],
            },
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="schedule_selected_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="preferred_schedule",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="selected_by_profiles",
                to="student.studentscheduleoption",
            ),
        ),
    ]
