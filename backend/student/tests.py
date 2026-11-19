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

    def test_candidate_step2_requirements_specs(self):
        from backend.student.enrollment_requirements import (
            get_requirement_specs,
            get_required_doc_keys,
            build_requirements_rows,
        )
        from backend.student.models import StudentEnrollmentProfile

        candidate_profile = StudentEnrollmentProfile.objects.create(
            user=self.candidate_user,
            entry_date=datetime.date(2026, 1, 1),
            birth_date=datetime.date(2000, 1, 1),
            program_type="assessment_only",
            selected_program="Driving NC III",
            profile_step_completed=True,
        )

        specs = get_requirement_specs(candidate_profile)
        spec_keys = [s["key"] for s in specs]
        self.assertEqual(
            spec_keys,
            [
                "birth_certificate",
                "valid_id",
                "covid_completion_certificate",
                "employment_certificate",
                "passport_photo",
                "assessment_fee_receipt",
            ],
        )

        required_keys = get_required_doc_keys(candidate_profile)
        # Only PSA, Valid ID, and CoC are required
        self.assertEqual(
            required_keys,
            {
                "birth_certificate",
                "valid_id",
                "covid_completion_certificate",
            },
        )

        rows = build_requirements_rows(candidate_profile)
        row_keys = [r["key"] for r in rows]
        self.assertEqual(row_keys, spec_keys)

        # Check hints match official requirements
        row_dict = {r["key"]: r for r in rows}
        self.assertIn("1pc. PSA/NSO Birth Certificate", row_dict["birth_certificate"]["hint"])
        self.assertIn("Government-issued ID", row_dict["valid_id"]["hint"])
        self.assertIn("Practicing COVID-19 Preventive Measures", row_dict["covid_completion_certificate"]["hint"])
        self.assertFalse(row_dict["employment_certificate"]["required"])
        self.assertFalse(row_dict["passport_photo"]["required"])
        self.assertFalse(row_dict["assessment_fee_receipt"]["required"])

    def test_trainee_step2_requirements_specs(self):
        from backend.student.enrollment_requirements import (
            get_requirement_specs,
            get_required_doc_keys,
            build_requirements_rows,
        )
        from backend.student.models import StudentEnrollmentProfile

        trainee_profile = StudentEnrollmentProfile.objects.create(
            user=self.trainee_user,
            entry_date=datetime.date(2026, 1, 1),
            birth_date=datetime.date(2000, 1, 1),
            program_type="training_with_assessment",
            selected_program="Automotive Servicing NC I",
            profile_step_completed=True,
        )

        specs = get_requirement_specs(trainee_profile)
        spec_keys = [s["key"] for s in specs]
        self.assertEqual(
            spec_keys,
            ["birth_certificate", "valid_id", "good_moral", "transcript"],
        )
        required_keys = get_required_doc_keys(trainee_profile)
        self.assertEqual(required_keys, {"birth_certificate", "valid_id"})

    def test_candidate_requirements_view_rendering(self):
        from backend.student.models import StudentEnrollmentProfile

        StudentEnrollmentProfile.objects.create(
            user=self.candidate_user,
            entry_date=datetime.date(2026, 1, 1),
            birth_date=datetime.date(2000, 1, 1),
            program_type="assessment_only",
            selected_program="Driving NC III",
            profile_step_completed=True,
        )

        self.client.force_login(self.candidate_user)
        session = self.client.session
        session["portal_role"] = "student"
        session.save()

        resp = self.client.get("/dashboard/student/enrollment/requirements/")
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode("utf-8")

        # Must show assessment copy and requirements
        self.assertIn("Assessment Application Process", content)
        self.assertIn("PSA/NSO Birth Certificate", content)
        self.assertIn("Valid ID", content)
        self.assertIn("Certificate of Completion", content)
        self.assertIn("Certificate of Employment", content)
        self.assertIn("Passport-size ID Picture", content)
        self.assertIn("Assessment Fee", content)
        # Trainee requirements like Good Moral and Transcript should not be shown
        self.assertNotIn("Certificate of Good Moral", content)
        self.assertNotIn("Transcript of Records", content)

    def test_ajax_upload_and_removal(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from backend.student.models import StudentEnrollmentProfile

        StudentEnrollmentProfile.objects.create(
            user=self.candidate_user,
            entry_date=datetime.date(2026, 1, 1),
            birth_date=datetime.date(2000, 1, 1),
            program_type="assessment_only",
            selected_program="Driving NC III",
            profile_step_completed=True,
        )

        self.client.force_login(self.candidate_user)
        session = self.client.session
        session["portal_role"] = "student"
        session.save()

        # AJAX Upload
        dummy_pdf = SimpleUploadedFile("psa_birth.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        resp = self.client.post(
            "/dashboard/student/enrollment/requirements/",
            {
                "action": "upload",
                "document_type": "birth_certificate",
                "file": dummy_pdf,
            },
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["document_type"], "birth_certificate")
        self.assertIn("requirements_list_html", data)
        self.assertIn("psa_birth.pdf", data["requirements_list_html"])

        # AJAX Cancel / Removal
        resp_cancel = self.client.post(
            "/dashboard/student/enrollment/requirements/",
            {
                "action": "cancel",
                "document_type": "birth_certificate",
            },
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(resp_cancel.status_code, 200)
        data_cancel = resp_cancel.json()
        self.assertTrue(data_cancel["ok"])
        self.assertIn("requirements_list_html", data_cancel)

    def test_registrar_enrollment_detail_assessment_only(self):
        from backend.registrar.enrollment_detail import build_learner_profile_detail
        from backend.student.models import StudentEnrollmentProfile

        candidate_profile = StudentEnrollmentProfile.objects.create(
            user=self.candidate_user,
            entry_date=datetime.date(2026, 11, 19),
            birth_date=datetime.date(2001, 10, 11),
            last_name="Cagang",
            first_name="Katelyne Marie",
            middle_name="Patana",
            program_type="assessment_only",
            selected_program="Driving NC III (Passenger Bus / Straight Truck)",
            profile_step_completed=True,
            assessment_application_data={
                "school_name": "Valiant Technical Institute and Assessment Center, Inc.",
                "school_address": "Bangoy St., Salvacion, Panabo, Philippines, 8105",
                "assessment_title": "Driving NC III (Passenger Bus / Straight Truck)",
                "assessment_types": ["full_qualification"],
                "client_types": ["industry_worker"],
                "mother_name": "Maria Cagang",
                "father_name": "Jose Cagang",
                "tel_number": "082-123456",
                "fax": "",
                "contact_other": "",
                "zip_code": "8105",
                "age": "25",
                "work_experience": [
                    {
                        "company": "Bus Liner Inc.",
                        "position": "Driver",
                        "inclusive_dates": "01/2022",
                        "monthly_salary": "25000",
                        "appointment_status": "Regular",
                        "years_experience": "3",
                    }
                ],
                "training_seminars": [
                    {
                        "title": "Defensive Driving",
                        "venue": "Davao City",
                        "inclusive_dates": "03/2023",
                        "hours": "16",
                        "conducted_by": "LTO",
                    }
                ],
                "licensure_exams": [
                    {
                        "title": "Professional Driver License",
                        "year_taken": "2020",
                        "venue": "Panabo",
                        "rating": "Passed",
                        "remarks": "Active",
                        "expiry_date": "10/2028",
                    }
                ],
                "competency_assessments": [
                    {
                        "title": "Driving NC II",
                        "qualification_level": "NC II",
                        "industry_sector": "Automotive and Land Transportation",
                        "certificate_number": "CERT-12345",
                        "date_issued": "05/2021",
                        "expiration_date": "05/2026",
                    }
                ],
            },
        )

        detail = build_learner_profile_detail(candidate_profile, None)
        self.assertEqual(detail["formType"], "assessment_only")
        aa = detail["assessmentApplication"]
        self.assertEqual(aa["header"]["formCode"], "TESDA-OP-CO-05-F26")
        self.assertEqual(aa["school"]["assessmentTypes"], ["full_qualification"])
        self.assertEqual(aa["section1_clientType"]["selected"], ["industry_worker"])
        self.assertEqual(aa["section2_profile"]["parents"]["motherName"], "Maria Cagang")
        self.assertEqual(aa["section2_profile"]["parents"]["fatherName"], "Jose Cagang")
        self.assertEqual(len(aa["section3_workExperience"]), 1)
        self.assertEqual(aa["section3_workExperience"][0]["company"], "Bus Liner Inc.")
        self.assertEqual(len(aa["section4_trainingSeminars"]), 1)
        self.assertEqual(aa["section4_trainingSeminars"][0]["title"], "Defensive Driving")
        self.assertEqual(len(aa["section5_licensureExams"]), 1)
        self.assertEqual(aa["section5_licensureExams"][0]["title"], "Professional Driver License")
        self.assertEqual(len(aa["section6_competencyAssessments"]), 1)
        self.assertEqual(aa["section6_competencyAssessments"][0]["title"], "Driving NC II")


