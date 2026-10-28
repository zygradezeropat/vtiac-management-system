from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from django.utils import timezone

from backend.core.models import StaffProfile
from backend.student.models import StudentRegistration, StudentEnrollmentProfile
from backend.cashier.models import CashierPayment
from backend.cashier.student_search import (
    _serialize_student,
    calculate_receivables_aging_summary,
    list_students_for_cashier,
    search_students,
)
from backend.cashier.report_export import build_report_workbook

User = get_user_model()


class CashierReceivablesAgingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="cashier_user",
            password="Password123!",
            email="cashier@example.com",
        )
        StaffProfile.objects.create(user=self.user, role=StaffProfile.Role.CASHIER)
        self.client = Client()
        self.client.force_login(self.user)
        session = self.client.session
        session["portal_role"] = "cashier"
        session.save()

        # Create student 1: Unpaid regular student
        self.reg1 = StudentRegistration.objects.create(
            first_name="Juan",
            middle_name="Santos",
            last_name="Dela Cruz",
            email="juan.delacruz@example.com",
            phone_number="09171234567",
            reference_id="REF-JUAN01",
            selected_program="Shielded Metal Arc Welding (SMAW) NC II",
            program_type=StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT,
            birth_date=date(2000, 1, 1),
            gender=StudentRegistration.Gender.MALE,
            civil_status=StudentRegistration.CivilStatus.SINGLE,
            emergency_name="Maria Dela Cruz",
            emergency_phone="09181234567",
            status=StudentRegistration.Status.APPROVED,
        )

        # Create student 2: Overdue student (registered 60 days ago)
        old_date = timezone.now() - timedelta(days=60)
        self.reg2 = StudentRegistration.objects.create(
            first_name="Maria",
            middle_name="",
            last_name="Clara",
            email="maria.clara@example.com",
            phone_number="09177654321",
            reference_id="REF-MARIA02",
            selected_program="Shielded Metal Arc Welding (SMAW) NC II",
            program_type=StudentRegistration.ProgramType.ASSESSMENT_ONLY,
            birth_date=date(2001, 5, 15),
            gender=StudentRegistration.Gender.FEMALE,
            civil_status=StudentRegistration.CivilStatus.SINGLE,
            emergency_name="Capitan Tiago",
            emergency_phone="09187654321",
            status=StudentRegistration.Status.APPROVED,
        )
        StudentRegistration.objects.filter(pk=self.reg2.pk).update(created_at=old_date)
        self.reg2.refresh_from_db()

        # Create student 3: Scholar student with enrollment profile
        self.student_user = User.objects.create_user(
            username="scholar_student",
            password="Password123!",
            email="scholar@example.com",
        )
        self.reg3 = StudentRegistration.objects.create(
            first_name="Crisostomo",
            last_name="Ibarra",
            email="scholar@example.com",
            phone_number="09199999999",
            reference_id="REF-IBARRA03",
            selected_program="Shielded Metal Arc Welding (SMAW) NC II",
            program_type=StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT,
            birth_date=date(1999, 10, 10),
            gender=StudentRegistration.Gender.MALE,
            civil_status=StudentRegistration.CivilStatus.SINGLE,
            emergency_name="Rafael Ibarra",
            emergency_phone="09198888888",
            status=StudentRegistration.Status.APPROVED,
        )
        self.profile3 = StudentEnrollmentProfile.objects.create(
            user=self.student_user,
            registration=self.reg3,
            entry_date=date.today(),
            first_name="Crisostomo",
            last_name="Ibarra",
            email="scholar@example.com",
            scholarship_type="tesda",
            selected_program="Shielded Metal Arc Welding (SMAW) NC II",
            sex=StudentRegistration.Gender.MALE,
            birth_date=date(1999, 10, 10),
        )

    def test_serialize_student_fields(self):
        serialized = _serialize_student(self.reg1, None)
        self.assertEqual(serialized["studentId"], "REF-JUAN01")
        self.assertEqual(serialized["name"], "Juan Santos Dela Cruz")
        self.assertEqual(serialized["courseTypeLabel"], "Training with Assessment")
        self.assertFalse(serialized["isScholar"])
        self.assertEqual(serialized["scholarshipLabel"], "Regular")
        self.assertIn("dueDate", serialized)
        self.assertIn("daysOverdue", serialized)
        self.assertIn("paymentStatus", serialized)
        self.assertIn("agingBracket", serialized)

    def test_scholar_student_serialization(self):
        serialized = _serialize_student(self.reg3, self.profile3)
        self.assertTrue(serialized["isScholar"])
        self.assertIn("Scholar", serialized["scholarshipLabel"])

    def test_overdue_student_detection(self):
        serialized = _serialize_student(self.reg2, None)
        self.assertTrue(serialized["isOverdue"])
        self.assertGreater(serialized["daysOverdue"], 0)
        self.assertIn(serialized["agingBracket"], ["1-30", "31-60", "61-90", "90+"])

    def test_search_by_student_id_and_name(self):
        # Search by student reference ID
        results_id = search_students("JUAN01")
        self.assertTrue(any(s["referenceId"] == "REF-JUAN01" for s in results_id))

        # Search by name
        results_name = search_students("Clara")
        self.assertTrue(any(s["referenceId"] == "REF-MARIA02" for s in results_name))

    def test_calculate_receivables_aging_summary(self):
        students = list_students_for_cashier()
        summary = calculate_receivables_aging_summary(students)

        self.assertIn("totalReceivables", summary)
        self.assertIn("totalAssessed", summary)
        self.assertIn("unpaid", summary)
        self.assertIn("partial", summary)
        self.assertIn("overdue", summary)
        self.assertIn("brackets", summary)
        self.assertIn("current", summary["brackets"])
        self.assertIn("days1_30", summary["brackets"])
        self.assertIn("days31_60", summary["brackets"])

    def test_receivables_aging_api_endpoint(self):
        res = self.client.get("/cashier/api/receivables/aging/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("aging", data)
        self.assertIn("students", data)
        self.assertGreater(len(data["students"]), 0)

    def test_students_list_api_endpoint_has_aging(self):
        res = self.client.get("/cashier/api/students/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("students", data)
        self.assertIn("aging", data)

    def test_build_report_workbook_aging(self):
        buffer, filename = build_report_workbook("aging")
        self.assertIn("Receivables_Aging", filename)
        self.assertGreater(len(buffer.getvalue()), 0)
