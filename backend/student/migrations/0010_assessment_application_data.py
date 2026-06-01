from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0009_alter_studentenrollmentprofile_photo"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentenrollmentprofile",
            name="assessment_application_data",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="TESDA Application Form fields for assessment-only enrollees.",
            ),
        ),
    ]
