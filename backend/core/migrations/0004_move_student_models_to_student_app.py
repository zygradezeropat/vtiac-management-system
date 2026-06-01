# Remove student models from core app state (tables unchanged; owned by student app).

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_studentprofile_studentregistration_user"),
        ("student", "0001_move_student_models_to_student_app"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RemoveField(
                    model_name="studentregistration",
                    name="user",
                ),
                migrations.DeleteModel(
                    name="StudentProfile",
                ),
                migrations.DeleteModel(
                    name="StudentRegistration",
                ),
            ],
        ),
    ]
