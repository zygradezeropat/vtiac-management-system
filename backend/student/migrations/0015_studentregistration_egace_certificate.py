from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0014_studentregistration_egace_employment"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentregistration",
            name="egace_certificate",
            field=models.BooleanField(
                default=False,
                help_text="Registrar E.G.A.C.E table — certificate milestone (set manually).",
            ),
        ),
    ]
