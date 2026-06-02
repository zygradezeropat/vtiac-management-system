from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0013_document_registrar_review"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentregistration",
            name="egace_employment",
            field=models.BooleanField(
                default=False,
                help_text="Registrar E.G.A.C.E table — employment milestone (set manually).",
            ),
        ),
    ]
