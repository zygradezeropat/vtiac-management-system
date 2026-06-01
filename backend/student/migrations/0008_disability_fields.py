from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0007_tesda_enrollment_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="disability_types",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="disability_other_specify",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="disability_causes",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
