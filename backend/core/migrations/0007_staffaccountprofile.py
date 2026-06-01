from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_rename_core_portal_user_id_created_idx_core_portal_user_id_1563c6_idx_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="StaffAccountProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("phone_number", models.CharField(blank=True, max_length=32)),
                ("region_code", models.CharField(blank=True, max_length=32)),
                ("province_code", models.CharField(blank=True, max_length=32)),
                ("city_code", models.CharField(blank=True, max_length=32)),
                ("barangay_code", models.CharField(blank=True, max_length=32)),
                ("street_house", models.CharField(blank=True, max_length=255)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="staff_account_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Staff account profile",
                "verbose_name_plural": "Staff account profiles",
            },
        ),
    ]
