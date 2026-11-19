import datetime
from django.test import TestCase, RequestFactory
from django.contrib.auth.models import User
from django.contrib.sessions.middleware import SessionMiddleware
from backend.student.models import (
    StudentProfile,
    StudentRegistration,
    StudentEnrollmentProfile,
)
from backend.core.context_processors import portal_user
from backend.student.services import (
    _student_sidebar_menu,
    student_enrollment_context,
)


def add_session_to_request(request):
    middleware = SessionMiddleware(lambda req: None)
    middleware.process_request(request)
    request.session.save()


class AssessmentOnlyLabelAndContextTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

        # Regular trainee student
        self.trainee_user = User.objects.create_user(
            username="trainee@vtiac.edu.ph",
            email="trainee@vtiac.edu.ph",
            password="StrongPassword123!",
            first_name="Juan",
            last_name="Trainee",
        )
        StudentProfile.objects.create(user=self.trainee_user)
        StudentRegistration.objects.create(
            user=self.trainee_user,
            email=self.trainee_user.email,
            first_name=self.trainee_user.first_name,
            last_name=self.trainee_user.last_name,
            birth_date=datetime.date(2000, 1, 1),
            program_type="training_with_assessment",
            selected_program="Automotive Servicing NC I",
            status=StudentRegistration.Status.PENDING,
        )

        # Assessment-only candidate
        self.candidate_user = User.objects.create_user(
            username="candidate@vtiac.edu.ph",
            email="candidate@vtiac.edu.ph",
            password="StrongPassword123!",
            first_name="Maria",
            last_name="Candidate",
        )
        StudentProfile.objects.create(user=self.candidate_user)
        StudentRegistration.objects.create(
            user=self.candidate_user,
            email=self.candidate_user.email,
            first_name=self.candidate_user.first_name,
            last_name=self.candidate_user.last_name,
            birth_date=datetime.date(2000, 1, 1),
            program_type="assessment_only",
            selected_program="Driving NC III (Passenger Bus / Straight Truck)",
            status=StudentRegistration.Status.PENDING,
        )

    def test_trainee_context_processor(self):
        request = self.factory.get("/dashboard/student/enrollment/")
        request.user = self.trainee_user
        add_session_to_request(request)
        request.session["portal_role"] = "student"

        ctx = portal_user(request)
        self.assertFalse(ctx["is_assessment_only"])
        self.assertEqual(ctx["portal_role_label"], "Student")

        notif = ctx["enrollment_notification"]
        self.assertIsNotNone(notif)
        self.assertEqual(notif["title"], "You are not yet enrolled.")
        self.assertIn("learner profile", notif["description"])
        self.assertEqual(notif["action_label"], "Complete Enrollment")

    def test_candidate_context_processor(self):
        request = self.factory.get("/dashboard/student/enrollment/")
        request.user = self.candidate_user
        add_session_to_request(request)
        request.session["portal_role"] = "student"

        ctx = portal_user(request)
        self.assertTrue(ctx["is_assessment_only"])
        self.assertEqual(ctx["portal_role_label"], "Candidate")

        notif = ctx["enrollment_notification"]
        self.assertIsNotNone(notif)
        self.assertEqual(notif["title"], "Assessment Application Incomplete")
        self.assertIn("TESDA Application Form", notif["description"])
        self.assertEqual(notif["action_label"], "Complete Application")

    def test_sidebar_menu_labels(self):
        trainee_menu = _student_sidebar_menu(self.trainee_user)
        enroll_item = next((item for item in trainee_menu if item["route_name"] == "student_enrollment"), None)
        self.assertIsNotNone(enroll_item)
        self.assertEqual(enroll_item["label"], "Enrollment")

        candidate_menu = _student_sidebar_menu(self.candidate_user)
        candidate_item = next((item for item in candidate_menu if item["route_name"] == "student_enrollment"), None)
        self.assertIsNotNone(candidate_item)
        self.assertEqual(candidate_item["label"], "Assessment")

    def test_enrollment_form_context_headings(self):
        # Trainee context
        req_trainee = self.factory.get("/dashboard/student/enrollment/")
        req_trainee.user = self.trainee_user
        add_session_to_request(req_trainee)
        trainee_ctx = student_enrollment_context(req_trainee)
        self.assertEqual(trainee_ctx["page_title"], "Registration Process")
        self.assertEqual(trainee_ctx["page_subtitle"], "Complete your registration step by step")
        self.assertEqual(trainee_ctx["active_menu"], "Enrollment")

        # Candidate context
        req_candidate = self.factory.get("/dashboard/student/enrollment/")
        req_candidate.user = self.candidate_user
        add_session_to_request(req_candidate)
        candidate_ctx = student_enrollment_context(req_candidate)
        self.assertEqual(candidate_ctx["page_title"], "Assessment Application Process")
        self.assertEqual(candidate_ctx["page_subtitle"], "Complete your competency assessment application step by step")
        self.assertEqual(candidate_ctx["active_menu"], "Assessment")

    def test_enrollment_view_rendering_candidate(self):
        self.client.force_login(self.candidate_user)
        session = self.client.session
        session["portal_role"] = "student"
        session.save()

        resp = self.client.get("/dashboard/student/enrollment/")
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode("utf-8")

        # 1. Sidebar contains Assessment
        self.assertIn("Assessment", content)
        # 2. Role badge contains Candidate
        self.assertIn("Candidate", content)
        # 3. Status Alert Banner
        self.assertIn("Assessment Application Incomplete", content)
        self.assertIn("Complete Application", content)
        # 4. Main Page Header
        self.assertIn("Assessment Application Process", content)
        self.assertIn("Complete your competency assessment application step by step", content)

    def test_candidate_dashboard_rendering(self):
        self.client.force_login(self.candidate_user)
        session = self.client.session
        session["portal_role"] = "student"
        session.save()

        resp = self.client.get("/candidate/dashboard/")
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode("utf-8")

        # Candidate identity & status badge
        self.assertIn("Application Incomplete", content)
        self.assertNotIn("Not Yet Enrolled", content)
        self.assertNotIn("Officially Enrolled", content)

        # Status alert banner & sidebar
        self.assertIn("Assessment Application Incomplete", content)
        self.assertIn("Complete Application", content)
        self.assertIn("Assessment", content)

        # Candidate calendar
        self.assertIn('id="vtiac-dashboard-calendar"', content)
        self.assertIn('data-role="candidate"', content)
        self.assertIn("Assessment &amp; Events Calendar", content)

    def test_candidate_calendar_events_api(self):
        from backend.registrar.models import RegistrarScheduleTemplate

        # Create an assessment batch matching the candidate's qualification
        RegistrarScheduleTemplate.objects.create(
            course_name="Driving NC III (Passenger Bus / Straight Truck)",
            batch_label="Batch 2026-A",
            batch_kind="national_assessment",
            assessment_at=datetime.datetime(2026, 12, 10, 8, 30, tzinfo=datetime.timezone.utc),
            examiner_name="Engr. Santos (TESDA)",
        )

        self.client.force_login(self.candidate_user)
        session = self.client.session
        session["portal_role"] = "student"
        session.save()

        resp = self.client.get("/api/calendar/events/?role=candidate")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["role"], "candidate")
        self.assertFalse(data["can_see_all"])

        event_titles = [e["title"] for e in data["events"]]
        event_types = [e["type"] for e in data["events"]]

        # Should include their own assessment event
        self.assertTrue(any("National Assessment: Driving NC III" in t for t in event_titles))
        # Should include assessment announcements and institutional assessment week
        self.assertTrue(any("Mid-Year National Assessment Week" in t for t in event_titles))
        self.assertTrue(any("Announcement" in t for t in event_titles))

        # Should NOT include training class starts or ends
        self.assertNotIn("class_start", event_types)
        self.assertNotIn("class_end", event_types)
        self.assertFalse(any("New Student Orientation" in t for t in event_titles))
        self.assertFalse(any("Semester Enrollment Period" in t for t in event_titles))
        self.assertFalse(any("TESDA National Certificate (NC) Releasing" in t for t in event_titles))

