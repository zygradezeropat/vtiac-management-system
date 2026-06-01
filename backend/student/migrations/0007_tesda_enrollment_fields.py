from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0006_payment_proof"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="street_house",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="district",
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="employment_type",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="date_accomplished",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="noted_by",
            field=models.CharField(
                blank=True,
                help_text="Registrar / school administrator signature (staff only).",
                max_length=255,
            ),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="date_received",
            field=models.DateField(
                blank=True,
                help_text="Date the form was received at the office (staff only).",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="studentenrollmentprofile",
            name="civil_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("single", "Single"),
                    ("married", "Married"),
                    ("widowed", "Widow/er"),
                    ("separated", "Separated / Divorced / Annulled"),
                    ("common_law", "Common Law / Live-in"),
                ],
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="studentregistration",
            name="civil_status",
            field=models.CharField(
                choices=[
                    ("single", "Single"),
                    ("married", "Married"),
                    ("widowed", "Widow/er"),
                    ("separated", "Separated / Divorced / Annulled"),
                    ("common_law", "Common Law / Live-in"),
                ],
                max_length=16,
            ),
        ),
    ]
