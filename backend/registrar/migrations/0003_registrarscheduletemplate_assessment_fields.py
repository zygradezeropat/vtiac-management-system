from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registrar", "0002_registrarscheduletemplate_batch_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="assessment_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="examiner_name",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="examination_course",
            field=models.CharField(blank=True, max_length=200),
        ),
    ]
