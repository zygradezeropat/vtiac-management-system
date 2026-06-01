from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registrar", "0001_registrarscheduletemplate"),
    ]

    operations = [
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="batch_label",
            field=models.CharField(default="Batch 1", max_length=64),
        ),
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("finalized", "Finalized")],
                db_index=True,
                default="draft",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="finalized_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="registrarscheduletemplate",
            name="students_snapshot",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
