from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0010_assessment_application_data"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentregistration",
            name="preferred_schedule",
            field=models.CharField(
                blank=True,
                choices=[
                    ("mon_fri_8_5", "Mondays - Fridays (8am - 5pm)"),
                    ("sat_sun_8_5", "Saturdays - Sundays (8am - 5pm)"),
                    ("mon_fri_5_9", "Mondays - Fridays (5pm - 9pm)"),
                    ("wholeday_8_5", "Whole day (8am - 5pm)"),
                ],
                max_length=32,
            ),
        ),
    ]
