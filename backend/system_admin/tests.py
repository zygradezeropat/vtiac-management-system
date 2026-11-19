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

    def test_create_program_defaults_to_manual_empty_competencies(self):
        created = create_program(
            name="Bread and Pastry Production NC II",
            training_fee=6500.00,
        )
        program_id = created["id"]
        comps = list_program_competencies(program_id)
        # Fully manual: newly registered program starts with 0 competencies unless manually supplied
        self.assertEqual(len(comps), 0)

    def test_delete_program_removes_program_and_competencies(self):
        from backend.system_admin.programs import delete_program

        created = create_program(
            name="Welding SMAW NC II",
            training_fee=5000.00,
            competencies=[
                {"category": "core", "code": "WELD-01", "title": "Weld Carbon Steel Plates", "nominal_hours": 40}
            ]
        )
        program_id = created["id"]
        self.assertTrue(NcProgram.objects.filter(pk=program_id).exists())
        self.assertTrue(ProgramCompetency.objects.filter(program_id=program_id).exists())

        delete_program(program_id)
        self.assertFalse(NcProgram.objects.filter(pk=program_id).exists())
        self.assertFalse(ProgramCompetency.objects.filter(program_id=program_id).exists())

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


class TesdaPdfExtractionTests(TestCase):
    def test_extract_qualification_name_and_competencies_from_text(self):
        from backend.system_admin.pdf_extractor import (
            extract_qualification_name,
            parse_tesda_competencies,
        )

        sample_tr_text = """
                  TRAINING REGULATIONS FOR
      DRIVING (Passenger Bus/Straight Truck) NC III

SECTION 1  DRIVING NC III QUALIFICATION

   The Units of Competency comprising this Qualification include the following:

   CODE NO.     BASIC COMPETENCIES
   500311109    Lead Workplace Communication
   500311110    Lead Small Teams
   500311111    Develop and Practice Negotiation skills
   500311112    Solve Problems Related to Work Activities
   500311113    Use Mathematical Concepts and Techniques
   500311114    Use Relevant Technologies

   CODE         COMMON COMPETENCIES
   ALT723201    Apply Appropriate Sealant/Adhesive
   ALT311205    Interpret/Draw Technical Drawing
   ALT723202    Move and Position Vehicle
   ALT311204    Perform Job Estimate
   ALT311202    Perform Mensuration and Calculation
   ALT723203    Read, Interpret and Apply Specifications and Manuals
   ALT723204    Use and Apply Lubricant/Coolant
   ALT723205    Perform Shop Maintenance

   CODE NO.     CORE COMPETENCIES
   ALT723349    Perform Minor Maintenance and Servicing on Vehicles Classified
                under LTO Restriction Codes 3 up to 5
   ALT832305    Perform Pre-and Post Operation Procedures Vehicles Classified
                under LTO Restriction Codes 3 up to 5
   ALT832303    Obey and Observe Traffic Rules and Regulations
   ALT832309    Observe Road Health and Safety Practices
   ALT832304    Implement and Coordinate Accident-Emergency Procedures
   ALT832306    Drive Passenger Bus
   ALT832307    Drive Straight Truck

A person who has achieved this Qualification is competent to be:
         Passenger Bus Driver
         Straight Truck Driver
        """

        # 1. Test qualification name extraction
        prog_name = extract_qualification_name(sample_tr_text)
        self.assertEqual(prog_name, "DRIVING (Passenger Bus/Straight Truck) NC III")

        # 2. Test competencies parsed
        comps = parse_tesda_competencies(sample_tr_text)
        self.assertEqual(len(comps), 21)

        basic_comps = [c for c in comps if c["category"] == "basic"]
        common_comps = [c for c in comps if c["category"] == "common"]
        core_comps = [c for c in comps if c["category"] == "core"]

        self.assertEqual(len(basic_comps), 6)
        self.assertEqual(len(common_comps), 8)
        self.assertEqual(len(core_comps), 7)

        # 3. Test multi-line wrapped title joining
        alt723349 = next(c for c in core_comps if c["code"] == "ALT723349")
        self.assertEqual(
            alt723349["title"],
            "Perform Minor Maintenance and Servicing on Vehicles Classified under LTO Restriction Codes 3 up to 5",
        )

        alt832307 = next(c for c in core_comps if c["code"] == "ALT832307")
        self.assertEqual(alt832307["title"], "Drive Straight Truck")

    def test_extract_pdf_api_endpoint_validation(self):
        from django.contrib.auth.models import User
        from django.core.files.uploadedfile import SimpleUploadedFile
        from backend.core.models import StaffProfile
        from backend.system_admin.services import ADMIN_ROLE

        admin_user = User.objects.create_user(username="test_admin_pdf", password="password")
        StaffProfile.objects.create(user=admin_user, role=StaffProfile.Role.ADMIN)
        self.client.login(username="test_admin_pdf", password="password")
        session = self.client.session
        session["portal_role"] = ADMIN_ROLE
        session.save()

        # Non-pdf file should be rejected
        txt_file = SimpleUploadedFile("curriculum.txt", b"plain text", content_type="text/plain")
        resp = self.client.post("/admin/api/competencies/extract-pdf/", {"pdf_file": txt_file})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("must be a valid PDF", resp.json().get("error", ""))


class StaffSubstituteDynamicExpirationTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User
        from backend.core.models import StaffProfile

        self.admin = User.objects.create_user(
            username="admin_sub@vtiac.edu.ph",
            email="admin_sub@vtiac.edu.ph",
            password="StrongPassword123!",
            first_name="Admin",
            last_name="User",
            is_staff=True,
        )
        StaffProfile.objects.create(user=self.admin, role=StaffProfile.Role.ADMIN)

    def test_create_user_with_custom_dynamic_expiration(self):
        from datetime import timedelta
        from django.utils import timezone
        from backend.system_admin.user_management import create_user

        custom_expiry = timezone.now() + timedelta(hours=6)
        user_dict = create_user(
            account_type="staff",
            email="registrar_sub@vtiac.edu.ph",
            first_name="Jane",
            last_name="Registrar",
            password="StrongPassword123!",
            role="registrar",
            additional_roles=["cashier"],
            expires_at=custom_expiry.isoformat(),
        )

        self.assertEqual(user_dict["role"], "registrar")
        self.assertEqual(user_dict["additional_roles"], ["cashier"])
        self.assertTrue(user_dict["substitute_info"]["is_active"])
        self.assertFalse(user_dict["substitute_info"]["is_expired"])
        self.assertIsNotNone(user_dict["substitute_info"]["hours_remaining"])
        self.assertIn("cashier", user_dict["substitute_info"]["additional_roles"])

    def test_create_user_default_24h_when_no_expires_at(self):
        from backend.system_admin.user_management import create_user

        user_dict = create_user(
            account_type="staff",
            email="cashier_sub@vtiac.edu.ph",
            first_name="Bob",
            last_name="Cashier",
            password="StrongPassword123!",
            role="cashier",
            additional_roles=["admin"],
            expires_at="",
        )

        self.assertEqual(user_dict["role"], "cashier")
        self.assertEqual(user_dict["additional_roles"], ["admin"])
        self.assertTrue(user_dict["substitute_info"]["is_active"])
        # Should default to 24 hours (~23 or 24 hours remaining)
        self.assertIn(user_dict["substitute_info"]["hours_remaining"], (23, 24))

    def test_update_user_dynamic_expiration(self):
        from datetime import timedelta
        from django.utils import timezone
        from backend.system_admin.user_management import create_user, update_user

        user_dict = create_user(
            account_type="staff",
            email="trainer_staff@vtiac.edu.ph",
            first_name="Sam",
            last_name="Trainer",
            password="StrongPassword123!",
            role="trainer",
        )

        # Update to add registrar sub role with custom expiration of 3 days
        custom_expiry = timezone.now() + timedelta(days=3)
        updated = update_user(
            user_dict["id"],
            additional_roles=["registrar"],
            expires_at=custom_expiry.isoformat(),
        )

        self.assertIn("registrar", updated["additional_roles"])
        self.assertTrue(updated["substitute_info"]["is_active"])
        self.assertGreaterEqual(updated["substitute_info"]["hours_remaining"], 71)

    def test_expired_substitute_lapses_access(self):
        from datetime import timedelta
        from django.utils import timezone
        from django.contrib.auth.models import User
        from backend.system_admin.user_management import create_user

        past_expiry = timezone.now() - timedelta(hours=2)
        user_dict = create_user(
            account_type="staff",
            email="expired_sub@vtiac.edu.ph",
            first_name="Expired",
            last_name="User",
            password="StrongPassword123!",
            role="registrar",
            additional_roles=["cashier"],
            expires_at=past_expiry.isoformat(),
        )

        user = User.objects.get(pk=user_dict["id"])
        # StaffProfile.get_allowed_roles() will only return primary 'registrar' because temporary access expired
        allowed_roles = user.staff_profile.get_allowed_roles()
        self.assertEqual(allowed_roles, {"registrar"})
        self.assertFalse(user.staff_profile.is_substitute_active())

    def test_registrar_cannot_be_assigned_trainer_role(self):
        from backend.system_admin.user_management import create_user, update_user

        # Attempt to create registrar with trainer additional role should fail
        with self.assertRaises(ValueError):
            create_user(
                account_type="staff",
                email="reg_with_trainer@vtiac.edu.ph",
                first_name="Reg",
                last_name="Staff",
                password="StrongPassword123!",
                role="registrar",
                additional_roles=["trainer"],
            )

        # Creating registrar with cashier and admin additional roles should succeed
        user_dict = create_user(
            account_type="staff",
            email="reg_multi@vtiac.edu.ph",
            first_name="Reg",
            last_name="Staff",
            password="StrongPassword123!",
            role="registrar",
            additional_roles=["cashier", "admin"],
        )
        self.assertIn("cashier", user_dict["additional_roles"])
        self.assertIn("admin", user_dict["additional_roles"])
        self.assertNotIn("trainer", user_dict["additional_roles"])

        # Attempt to update registrar with trainer should also fail
        with self.assertRaises(ValueError):
            update_user(
                user_dict["id"],
                additional_roles=["trainer"],
            )

    def test_touch_logger_and_api(self):
        from django.contrib.auth.models import User
        from backend.core.models import StaffProfile
        from backend.system_admin.models import StaffTouchLog
        from backend.system_admin.touch_logger import log_staff_touch

        admin_user = User.objects.create_user(
            username="admin_logger@vtiac.edu.ph",
            email="admin_logger@vtiac.edu.ph",
            password="StrongPassword123!",
            first_name="Admin",
            last_name="Logger",
            is_staff=True,
        )
        StaffProfile.objects.create(user=admin_user, role=StaffProfile.Role.ADMIN)

        log_record = log_staff_touch(
            user=admin_user,
            portal_role="admin",
            module="cashier",
            action="Received Payment (OR)",
            target_type="CashierPayment",
            target_id="OR-2026-9999",
            target_name="Juan Dela Cruz",
            details="Amount: ₱1,500.00 | Paid in Full",
        )
        self.assertIsNotNone(log_record.pk)
        self.assertEqual(log_record.user_email, "admin_logger@vtiac.edu.ph")
        self.assertEqual(log_record.primary_role, "admin")
        self.assertEqual(log_record.module, "cashier")

        # Test API endpoint
        self.client.force_login(admin_user)
        resp = self.client.get("/admin/api/touch-logs/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(data["total_count"], 1)
        self.assertTrue(any(item["target_id"] == "OR-2026-9999" for item in data["items"]))

    def test_cross_role_editing_lock_and_xss_protection(self):
        import json
        from decimal import Decimal
        from django.contrib.auth.models import User
        from backend.core.models import StaffProfile
        from backend.cashier.models import CashierPayment
        from backend.cashier.payment_record import record_cashier_payment
        from backend.student.models import StudentEnrollmentProfile, StudentRegistration
        from django.core.exceptions import PermissionDenied

        # Create Cashier staff
        cashier_user = User.objects.create_user(
            username="cashier_prime@vtiac.edu.ph",
            email="cashier_prime@vtiac.edu.ph",
            password="StrongPassword123!",
            first_name="Cashier",
            last_name="Staff",
            is_staff=True,
        )
        StaffProfile.objects.create(user=cashier_user, role=StaffProfile.Role.CASHIER, additional_roles=["registrar"])

        # Create Registrar staff
        registrar_user = User.objects.create_user(
            username="registrar_prime@vtiac.edu.ph",
            email="registrar_prime@vtiac.edu.ph",
            password="StrongPassword123!",
            first_name="Registrar",
            last_name="Staff",
            is_staff=True,
        )
        StaffProfile.objects.create(user=registrar_user, role=StaffProfile.Role.REGISTRAR, additional_roles=["cashier", "admin"])

        # Create Student
        student_user = User.objects.create_user(
            username="test_trainee@vtiac.edu.ph",
            email="test_trainee@vtiac.edu.ph",
            password="StrongPassword123!",
            first_name="Maria",
            last_name="Santos",
        )
        reg = StudentRegistration.objects.create(
            user=student_user,
            email=student_user.email,
            first_name="Maria",
            last_name="Santos",
            phone_number="09123456789",
            birth_date="2000-01-01",
            gender="Female",
            civil_status="Single",
            emergency_name="Parent Contact",
            emergency_phone="09123456780",
            selected_program="Driving NC II",
            program_type=StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT,
        )
        import datetime
        profile = StudentEnrollmentProfile.objects.create(
            user=student_user,
            registration=reg,
            first_name="Maria",
            last_name="Santos",
            birth_date=datetime.date(2000, 1, 1),
            entry_date=datetime.date(2026, 1, 1),
            selected_program="Driving NC II",
            documents_review_released=True,
        )

        # 1. Cashier staff touches/records a payment
        pay_payload = {
            "studentId": profile.pk,
            "registrationId": str(reg.pk),
            "controlNumber": "CTRL-XSS-001",
            "orNumber": "OR-1001",
            "receiptType": "OR",
            "particulars": [{"description": "<script>alert('xss')</script>Tuition", "amount": 1000}],
            "paidAmount": 1000,
            "totalPayable": 1000,
            "status": "Full Payment",
        }
        res = record_cashier_payment(user=cashier_user, payload=pay_payload)
        self.assertEqual(res["status"], "Full Payment")

        # 2. Registrar acting as Cashier attempts to edit/record payment on this Cashier-touched student
        # Must be rejected with PermissionDenied!
        pay_payload2 = {
            "studentId": profile.pk,
            "registrationId": str(reg.pk),
            "controlNumber": "CTRL-BYPASS-002",
            "orNumber": "OR-1002",
            "receiptType": "OR",
            "particulars": [{"description": "Remaining", "amount": 500}],
            "paidAmount": 500,
            "totalPayable": 500,
        }
        with self.assertRaises(PermissionDenied):
            record_cashier_payment(user=registrar_user, payload=pay_payload2)

        # 3. Backend API endpoint bypass attempt by Registrar returns 403 Forbidden
        self.client.force_login(registrar_user)
        session = self.client.session
        session["portal_role"] = "cashier"
        session.save()
        api_resp = self.client.post(
            "/cashier/api/payments/record/",
            data=json.dumps(pay_payload2),
            content_type="application/json",
        )
        self.assertEqual(api_resp.status_code, 403)

        # 4. Vice Versa: Cashier acting as Registrar attempts to modify Registrar-touched enrollment
        # Registrar releases/touches the enrollment profile
        profile.documents_review_released = True
        profile.documents_review_released_by = registrar_user
        profile.last_touched_by = registrar_user
        profile.save()

        self.client.force_login(cashier_user)
        session = self.client.session
        session["portal_role"] = "registrar"
        session.save()
        reg_api_resp = self.client.post(
            "/registrar/api/enrollment/document/release/",
            data={"profile_id": str(profile.pk)},
        )
        self.assertEqual(reg_api_resp.status_code, 403)
        self.assertIn("Permission denied", reg_api_resp.json()["error"])




