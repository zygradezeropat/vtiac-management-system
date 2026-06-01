from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0012_preferred_schedule_sat_sun_5_9"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="photo_registrar_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pending", "Pending review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="pending",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="photo_rejection_reason",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="documents_review_released",
            field=models.BooleanField(
                default=False,
                help_text="Registrar approved all documents; student may proceed to payment.",
            ),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="documents_review_released_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="studentenrollmentdocument",
            name="registrar_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="pending",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="studentenrollmentdocument",
            name="rejection_reason",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="studentenrollmentdocument",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
