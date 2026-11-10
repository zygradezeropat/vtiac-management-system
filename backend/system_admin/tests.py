from django.test import TestCase
from backend.system_admin.models import NcProgram, ProgramCompetency
from backend.system_admin.programs import (
    create_program,
    save_program_competencies,
    list_program_competencies,
    get_competency_library,
)
from backend.trainer.grading_sample import (
    record_sheet_structure_for_program,
    unit_competencies_for_program,
    non_encodable_structure_for_program,
)


class DynamicProgramCompetencyTests(TestCase):
    def setUp(self):
        self.program = NcProgram.objects.create(
            name="Welding NC II",
            training_fee=5000.00,
            sort_order=1,
            is_active=True,
        )

    def test_save_and_list_program_competencies(self):
        competencies_data = [
            {
                "category": "basic",
                "code": "500311105",
                "title": "Participate in workplace communication",
                "nominal_hours": 4,
                "sort_order": 1,
                "learning_outcomes": ["Obtain and convey workplace information", "Complete relevant work related documents"],
            },
            {
                "category": "common",
                "code": "MEE721201",
                "title": "Apply safety practices",
                "nominal_hours": 10,
                "sort_order": 2,
                "learning_outcomes": ["Identify hazardous area", "Use protective clothing and devices"],
            },
            {
                "category": "core",
                "code": "MEE721301",
                "title": "Weld carbon steel plates using SMAW",
                "nominal_hours": 80,
                "sort_order": 3,
                "learning_outcomes": ["Perform groove weld on carbon steel plate in 1G position"],
            },
        ]

        saved = save_program_competencies(self.program.pk, competencies_data)
        self.assertEqual(len(saved), 3)

        comps = list_program_competencies(self.program.pk)
        self.assertEqual(len(comps), 3)
        self.assertEqual(comps[0]["category"], "basic")
        self.assertEqual(comps[1]["category"], "common")
        self.assertEqual(comps[2]["category"], "core")
        self.assertEqual(comps[2]["code"], "MEE721301")
        self.assertEqual(len(comps[2]["learningOutcomes"]), 1)

    def test_dynamic_trainer_sheets_reflect_custom_program(self):
        competencies_data = [
            {
                "category": "basic",
                "code": "B1",
                "title": "Basic Unit 1",
                "nominal_hours": 5,
                "learning_outcomes": ["LO 1", "LO 2"],
            },
            {
                "category": "common",
                "code": "C1",
                "title": "Common Unit 1",
                "nominal_hours": 10,
                "learning_outcomes": ["LO A"],
            },
            {
                "category": "core",
                "code": "CR1",
                "title": "Core Unit 1",
                "nominal_hours": 40,
                "learning_outcomes": ["LO Core 1", "LO Core 2"],
            },
        ]
        save_program_competencies(self.program.pk, competencies_data)

        # Test trainer record sheet structure dynamically reflects all 3 categories
        struct = record_sheet_structure_for_program("Welding NC II")
        self.assertEqual(len(struct), 3)
        self.assertEqual(struct[0]["label"], "BASIC COMPETENCIES")
        self.assertEqual(struct[1]["label"], "COMMON COMPETENCIES")
        self.assertEqual(struct[2]["label"], "CORE COMPETENCIES")
        self.assertEqual(struct[2]["units"][0]["title"], "Core Unit 1")

        # Test unit competencies for grading
        grading_units = unit_competencies_for_program("Welding NC II")
        self.assertEqual(len(grading_units), 3)

        # Test Sheet 3 non-encodable overall results structure
        non_encodable = non_encodable_structure_for_program("Welding NC II")
        self.assertEqual(len(non_encodable), 3)

    def test_competency_library(self):
        library = get_competency_library()
        self.assertIn("basic", library)
        self.assertIn("common", library)
        self.assertIn("core", library)
        self.assertTrue(len(library["basic"]) >= 4)
        self.assertTrue(len(library["common"]) >= 3)

    def test_create_program_auto_seeds_basic_and_common(self):
        created = create_program(
            name="Bread and Pastry Production NC II",
            training_fee=6500.00,
        )
        program_id = created["id"]
        comps = list_program_competencies(program_id)
        # Should have seeded standard Basic (4) and Common (3) competencies automatically
        self.assertGreaterEqual(len(comps), 7)
        basic_count = sum(1 for c in comps if c["category"] == "basic")
        common_count = sum(1 for c in comps if c["category"] == "common")
        self.assertEqual(basic_count, 4)
        self.assertEqual(common_count, 3)

    def test_program_creation_with_explicit_competencies_and_trainer_correspondence(self):
        from backend.trainer.services import PROGRAM_QUALIFICATIONS, get_active_program_qualifications
        from backend.system_admin.user_management import update_user, create_trainer_staff_user, serialize_user
        from django.contrib.auth.models import User

        new_prog = create_program(
            name="Solar PV Installation NC II",
            training_fee=12000.00,
            competencies=[
                {
                    "category": "basic",
                    "code": "BASIC-01",
                    "title": "Participate in workplace communication",
                    "nominal_hours": 4,
                },
                {
                    "category": "common",
                    "code": "COM-01",
                    "title": "Apply Quality Standards",
                    "nominal_hours": 8,
                },
                {
                    "category": "core",
                    "code": "SOLAR-CORE-01",
                    "title": "Install solar photovoltaic modules",
                    "nominal_hours": 60,
                    "learning_outcomes": ["Mount solar frames", "Connect PV wiring"],
                },
            ],
        )

        # 1. Registered program must immediately be available in trainer qualifications
        active_quals = list(PROGRAM_QUALIFICATIONS)
        self.assertIn("Solar PV Installation NC II", active_quals)
        self.assertIn("Solar PV Installation NC II", get_active_program_qualifications())

        # 2. Competencies must be stored
        prog_comps = list_program_competencies(new_prog["id"])
        self.assertEqual(len(prog_comps), 3)
        self.assertEqual(prog_comps[2]["code"], "SOLAR-CORE-01")
        self.assertEqual(prog_comps[2]["learningOutcomes"], ["Mount solar frames", "Connect PV wiring"])

        # 3. Dynamic trainer record sheets must immediately reflect the new program and units
        sheet = record_sheet_structure_for_program("Solar PV Installation NC II")
        self.assertEqual(len(sheet), 3)
        self.assertEqual(sheet[2]["label"], "CORE COMPETENCIES")
        self.assertEqual(sheet[2]["units"][0]["title"], "Install solar photovoltaic modules")

        # 4. Trainer can be assigned this newly registered program
        trainer_dict = create_trainer_staff_user({
            "first_name": "Juan",
            "last_name": "Trainer",
            "email": "juantrainer@example.com",
            "phone_number": "09171234567",
            "password": "Password123!",
            "password_confirm": "Password123!",
            "highest_tesda_nc": "NC II Assessor",
            "qualifications": ["Solar PV Installation NC II"],
            "years_experience": "4_6",
        })
        self.assertIn("Solar PV Installation NC II", trainer_dict.get("qualifications", []))

        # 5. Admin updates trainer qualifications to add another registered program
        updated = update_user(
            trainer_dict["id"],
            qualifications=["Solar PV Installation NC II", "Welding NC II"],
        )
        self.assertIn("Solar PV Installation NC II", updated.get("qualifications", []))
        self.assertIn("Welding NC II", updated.get("qualifications", []))


class TrainerEvaluationScheduleTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from backend.system_admin.models import SystemSettings
        from backend.student.models import StudentRegistration
        from backend.core.models import StaffProfile

        User = get_user_model()
        self.settings = SystemSettings.load()
        self.settings.evaluation_enabled = False
        self.settings.evaluation_start_date = None
        self.settings.evaluation_end_date = None
        self.settings.save()

        self.student_user = User.objects.create_user(
            username="student_test@example.com",
            email="student_test@example.com",
            password="Password123!",
            first_name="Maria",
            last_name="Santos",
        )
        import datetime
        from backend.student.models import StudentEnrollmentProfile, StudentScheduleOption

        # Create approved registration so student is enrolled
        StudentRegistration.objects.create(
            user=self.student_user,
            first_name="Maria",
            last_name="Santos",
            email="student_test@example.com",
            phone_number="09171234567",
            birth_date=datetime.date(2000, 1, 1),
            status=StudentRegistration.Status.APPROVED,
            selected_program="Welding NC II",
        )

        self.trainer_user = User.objects.create_user(
            username="trainer_test@example.com",
            email="trainer_test@example.com",
            password="Password123!",
            first_name="Pedro",
            last_name="Penduko",
        )
        StaffProfile.objects.create(
            user=self.trainer_user,
            role=StaffProfile.Role.TRAINER,
        )

        # Batch the student by the registrar to assign Pedro Penduko
        self.profile = StudentEnrollmentProfile.objects.create(
            user=self.student_user,
            last_name="Santos",
            first_name="Maria",
            email="student_test@example.com",
            birth_date=datetime.date(2000, 1, 1),
            entry_date=datetime.date.today(),
            selected_program="Welding NC II",
        )
        self.sched_option = StudentScheduleOption.objects.create(
            profile=self.profile,
            label="AY 2026-2027 · Batch 1",
            day="Monday – Friday",
            time_from="08:00",
            time_to="17:00",
            batch_label="Batch 1",
            course_name="Welding NC II",
            trainer="Pedro Penduko",
        )
        self.profile.preferred_schedule = self.sched_option
        self.profile.save()

    def test_default_is_disabled(self):
        from backend.system_admin.program_config import (
            trainer_evaluation_is_open,
            trainer_evaluation_status,
        )
        self.assertFalse(trainer_evaluation_is_open())
        status = trainer_evaluation_status()
        self.assertEqual(status["status"], "disabled")
        self.assertFalse(status["is_open"])

    def test_schedule_in_future_is_upcoming_and_disabled(self):
        from django.utils import timezone
        import datetime
        from backend.system_admin.programs import update_system_settings
        from backend.system_admin.program_config import (
            trainer_evaluation_is_open,
            trainer_evaluation_status,
        )

        today = timezone.localdate()
        future_start = today + datetime.timedelta(days=5)
        future_end = today + datetime.timedelta(days=12)

        update_system_settings(
            evaluation_enabled=True,
            evaluation_start_date=future_start.isoformat(),
            evaluation_end_date=future_end.isoformat(),
        )

        self.assertFalse(trainer_evaluation_is_open())
        status = trainer_evaluation_status()
        self.assertEqual(status["status"], "upcoming")
        self.assertFalse(status["is_open"])
        self.assertIn("scheduled to open", status["message"].lower())

    def test_schedule_in_past_is_closed_and_disabled(self):
        from django.utils import timezone
        import datetime
        from backend.system_admin.programs import update_system_settings
        from backend.system_admin.program_config import (
            trainer_evaluation_is_open,
            trainer_evaluation_status,
        )

        today = timezone.localdate()
        past_start = today - datetime.timedelta(days=14)
        past_end = today - datetime.timedelta(days=2)

        update_system_settings(
            evaluation_enabled=True,
            evaluation_start_date=past_start.isoformat(),
            evaluation_end_date=past_end.isoformat(),
        )

        self.assertFalse(trainer_evaluation_is_open())
        status = trainer_evaluation_status()
        self.assertEqual(status["status"], "closed")
        self.assertFalse(status["is_open"])
        self.assertIn("ended on", status["message"].lower())

    def test_schedule_hits_current_date_is_open_and_enabled(self):
        from django.utils import timezone
        import datetime
        from backend.system_admin.programs import update_system_settings
        from backend.system_admin.program_config import (
            trainer_evaluation_is_open,
            trainer_evaluation_status,
        )
        from backend.student.services import _student_sidebar_menu

        today = timezone.localdate()
        active_start = today - datetime.timedelta(days=1)
        active_end = today + datetime.timedelta(days=5)

        update_system_settings(
            evaluation_enabled=True,
            evaluation_start_date=active_start.isoformat(),
            evaluation_end_date=active_end.isoformat(),
        )

        self.assertTrue(trainer_evaluation_is_open())
        status = trainer_evaluation_status()
        self.assertEqual(status["status"], "open")
        self.assertTrue(status["is_open"])

        # Check student sidebar menu reflects enabled state
        menu = _student_sidebar_menu(self.student_user)
        eval_item = next(item for item in menu if item["route_name"] == "student_trainer_evaluation")
        self.assertFalse(eval_item["is_disabled"])
        self.assertNotEqual(eval_item["route"], "#")

    def test_sidebar_locked_when_schedule_not_hit(self):
        from django.utils import timezone
        import datetime
        from backend.system_admin.programs import update_system_settings
        from backend.student.services import _student_sidebar_menu

        today = timezone.localdate()
        future_start = today + datetime.timedelta(days=3)
        future_end = today + datetime.timedelta(days=10)

        update_system_settings(
            evaluation_enabled=True,
            evaluation_start_date=future_start.isoformat(),
            evaluation_end_date=future_end.isoformat(),
        )

        menu = _student_sidebar_menu(self.student_user)
        eval_item = next(item for item in menu if item["route_name"] == "student_trainer_evaluation")
        self.assertTrue(eval_item["is_disabled"])
        self.assertEqual(eval_item["route"], "#")
        self.assertTrue(len(eval_item["disabled_reason"]) > 0)

    def test_submission_blocked_when_schedule_disabled(self):
        from backend.trainer.evaluation import save_student_trainer_evaluation

        with self.assertRaises(ValueError) as cm:
            save_student_trainer_evaluation(
                self.student_user,
                {"trainer_id": str(self.trainer_user.pk), "q1": 5, "q2": 5, "q3": 5},
            )
        self.assertIn("disabled", str(cm.exception).lower())

    def test_submission_allowed_when_schedule_hit(self):
        from django.utils import timezone
        import datetime
        from backend.system_admin.programs import update_system_settings
        from backend.trainer.evaluation import save_student_trainer_evaluation

        today = timezone.localdate()
        update_system_settings(
            evaluation_enabled=True,
            evaluation_start_date=(today - datetime.timedelta(days=1)).isoformat(),
            evaluation_end_date=(today + datetime.timedelta(days=2)).isoformat(),
        )

        eval_record = save_student_trainer_evaluation(
            self.student_user,
            {"trainer_id": str(self.trainer_user.pk), "q1": 5, "q2": 4, "q3": 5, "comments": "Great trainer!"},
        )
        self.assertIsNotNone(eval_record)
        self.assertEqual(eval_record.trainer, self.trainer_user)
        self.assertEqual(eval_record.student, self.student_user)

    def test_notification_sent_and_eval_pending_prompt(self):
        from django.utils import timezone
        import datetime
        from django.test import RequestFactory
        from backend.system_admin.programs import update_system_settings
        from backend.core.models import PortalNotification
        from backend.student.services import _student_portal_base
        from backend.trainer.evaluation import save_student_trainer_evaluation

        today = timezone.localdate()
        update_system_settings(
            evaluation_enabled=True,
            evaluation_start_date=(today - datetime.timedelta(days=1)).isoformat(),
            evaluation_end_date=(today + datetime.timedelta(days=3)).isoformat(),
        )

        # 1. Enrolled student should have received an in-app portal notification
        notifs = PortalNotification.objects.filter(user=self.student_user)
        self.assertTrue(notifs.exists())
        self.assertIn("Trainer Evaluation", notifs.first().title)

        # 2. Student portal context should report eval_pending=True
        rf = RequestFactory()
        req = rf.get("/dashboard/student/")
        req.user = self.student_user
        ctx = _student_portal_base(req, "Dashboard", "Dashboard", "")
        self.assertTrue(ctx["eval_pending"])
        self.assertEqual(ctx["pending_trainer_name"], "Pedro Penduko")

        # 3. Once student submits evaluation, eval_pending becomes False
        save_student_trainer_evaluation(
            self.student_user,
            {"trainer_id": str(self.trainer_user.pk), "q1": 5, "q2": 5, "q3": 5},
        )
        ctx_after = _student_portal_base(req, "Dashboard", "Dashboard", "")
        self.assertFalse(ctx_after["eval_pending"])

    def test_enrolled_student_without_batching_has_no_trainer_and_is_locked(self):
        from django.contrib.auth import get_user_model
        from django.utils import timezone
        import datetime
        from backend.student.models import StudentRegistration
        from backend.system_admin.programs import update_system_settings
        from backend.trainer.evaluation import resolve_student_evaluation_target
        from backend.student.services import _student_sidebar_menu, _student_portal_base
        from django.test import RequestFactory

        User = get_user_model()
        unbatched_user = User.objects.create_user(
            username="unbatched@example.com",
            email="unbatched@example.com",
            password="Password123!",
            first_name="Clara",
            last_name="Reyes",
        )
        StudentRegistration.objects.create(
            user=unbatched_user,
            first_name="Clara",
            last_name="Reyes",
            email="unbatched@example.com",
            phone_number="09181234567",
            birth_date=datetime.date(2001, 2, 2),
            status=StudentRegistration.Status.APPROVED,
            selected_program="Welding NC II",
        )

        today = timezone.localdate()
        update_system_settings(
            evaluation_enabled=True,
            evaluation_start_date=(today - datetime.timedelta(days=1)).isoformat(),
            evaluation_end_date=(today + datetime.timedelta(days=5)).isoformat(),
        )

        # 1. Target resolution should NOT fall back to any random trainer
        target = resolve_student_evaluation_target(unbatched_user)
        self.assertIsNone(target["trainer_user"])
        self.assertFalse(target["has_assigned_trainer"])

        # 2. Sidebar should be locked with message explaining student is not yet batched
        menu = _student_sidebar_menu(unbatched_user)
        eval_item = next(item for item in menu if item["route_name"] == "student_trainer_evaluation")
        self.assertTrue(eval_item["is_disabled"])
        self.assertIn("assigned yet", eval_item["disabled_reason"].lower())

        # 3. Should not pop up or trigger eval_pending
        rf = RequestFactory()
        req = rf.get("/dashboard/student/")
        req.user = unbatched_user
        ctx = _student_portal_base(req, "Dashboard", "Dashboard", "")
        self.assertFalse(ctx["eval_pending"])

