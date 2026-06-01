from django.db import migrations, models


def wholeday_to_sat_sun_evening(apps, schema_editor):
    StudentRegistration = apps.get_model("student", "StudentRegistration")
    StudentRegistration.objects.filter(preferred_schedule="wholeday_8_5").update(
        preferred_schedule="sat_sun_5_9"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0011_studentregistration_preferred_schedule"),
    ]

    operations = [
        migrations.RunPython(wholeday_to_sat_sun_evening, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="studentregistration",
            name="preferred_schedule",
            field=models.CharField(
                blank=True,
                choices=[
                    ("mon_fri_8_5", "Mondays - Fridays (8am - 5pm)"),
                    ("sat_sun_8_5", "Saturdays - Sundays (8am - 5pm)"),
                    ("mon_fri_5_9", "Mondays - Fridays (5pm - 9pm)"),
                    ("sat_sun_5_9", "Saturdays - Sundays (5pm - 9pm)"),
                ],
                max_length=32,
            ),
        ),
    ]
