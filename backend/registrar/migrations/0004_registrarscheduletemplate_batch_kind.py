from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registrar", "0003_registrarscheduletemplate_assessment_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="batch_kind",
            field=models.CharField(
                choices=[
                    ("training", "Training"),
                    ("national_assessment", "National assessment"),
                ],
                db_index=True,
                default="training",
                max_length=32,
            ),
        ),
    ]
