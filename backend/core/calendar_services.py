"""Calendar Event Services for All Portal Dashboards."""

from datetime import datetime, date
from django.utils import timezone
from django.db import models
from backend.registrar.models import RegistrarScheduleTemplate
from backend.student.models import StudentRegistration, StudentEnrollmentProfile, StudentScheduleOption, StudentDocumentRequest


def get_calendar_events_for_user(user=None, role="admin"):
    """
    Returns a structured list of calendar events formatted for dashboard consumption.
    Role can be 'admin', 'registrar', 'cashier', 'student', or 'trainer'.
    """
    events = []

    # 1. Fetch Registrar Schedule Templates (Batches, Class Starts, End of Class, Assessments/Exams)
    templates = RegistrarScheduleTemplate.objects.all()

    if role == "trainer":
        if user and getattr(user, "is_authenticated", False):
            from backend.trainer.class_assignments import trainer_account_request_for_user, _trainer_name_for_lookup
            trainer_req = trainer_account_request_for_user(user)
            name = _trainer_name_for_lookup(trainer_req, user)
            if trainer_req or name:
                templates = templates.filter(
                    models.Q(trainer_request=trainer_req) | 
                    models.Q(trainer_name__iexact=name) | 
                    models.Q(trainer_name__icontains=name) |
                    models.Q(created_by=user)
                ) if trainer_req else templates.filter(
                    models.Q(trainer_name__icontains=name) | 
                    models.Q(created_by=user)
                )
            else:
                templates = templates.filter(created_by=user)
        else:
            templates = templates.none()

    elif role == "student":
        if user and getattr(user, "is_authenticated", False):
            student_email = getattr(user, "email", "").strip().lower()
            reg = (
                getattr(user, "registration_application", None)
                or StudentRegistration.objects.filter(models.Q(user=user) | models.Q(email__iexact=student_email)).first()
            )
            profile = (
                getattr(user, "enrollment_profile", None)
                or StudentEnrollmentProfile.objects.filter(models.Q(user=user) | models.Q(email__iexact=student_email)).first()
            )

            selected_program = (reg.selected_program if reg else "") or (profile.selected_program if profile else "")
            ref_id = reg.reference_id if reg else ""

            matching_ids = []
            for t in templates:
                is_in_snapshot = False
                if isinstance(t.students_snapshot, list) and t.students_snapshot:
                    for entry in t.students_snapshot:
                        e_email = (entry.get("email") or "").strip().lower()
                        e_ref = (entry.get("reference_id") or "").strip()
                        if (e_email and e_email == student_email) or (e_ref and e_ref == ref_id):
                            is_in_snapshot = True
                            break

                if is_in_snapshot or (selected_program and t.course_name.strip().lower() == selected_program.strip().lower()):
                    matching_ids.append(t.id)

            templates = templates.filter(id__in=matching_ids)
        else:
            templates = templates.none()

    # Determine if enrolled students roster should be visible to this role
    show_roster = role in ["admin", "registrar", "trainer"]

    for t in templates:
        # Get enrolled students for batch snapshot if staff role
        students_list = []
        if show_roster:
            if isinstance(t.students_snapshot, list) and t.students_snapshot:
                students_list = t.students_snapshot
            else:
                students_list = [
                    {
                        "first_name": row.first_name,
                        "last_name": row.last_name,
                        "email": row.email,
                        "phone": row.phone_number,
                        "reference_id": row.reference_id,
                        "program": row.selected_program,
                    }
                    for row in StudentRegistration.objects.filter(
                        status=StudentRegistration.Status.APPROVED,
                        selected_program=t.course_name,
                    ).order_by("last_name", "first_name")
                ]

        # Class Start Date Event
        if t.available_from:
            events.append({
                "id": f"class-start-{t.id}",
                "title": f"Start of Class: {t.course_name} ({t.batch_label})",
                "date": t.available_from.strftime("%Y-%m-%d"),
                "time": f"{t.time_from} - {t.time_to}" if t.time_from and t.time_to else "08:00 AM - 05:00 PM",
                "type": "class_start",
                "category": "Class Schedule",
                "badge_class": "badge-class-start",
                "course_name": t.course_name,
                "batch_label": t.batch_label,
                "trainer": t.trainer_name or "Assigned Trainer",
                "status": t.get_status_display(),
                "students": students_list,
                "details": f"First day of classes for {t.course_name} ({t.batch_label}). Schedule: {', '.join(t.days or []) if isinstance(t.days, list) else t.days}."
            })

        # End of Class Date Event
        if t.available_until:
            events.append({
                "id": f"class-end-{t.id}",
                "title": f"End of Class: {t.course_name} ({t.batch_label})",
                "date": t.available_until.strftime("%Y-%m-%d"),
                "time": f"{t.time_from} - {t.time_to}" if t.time_from and t.time_to else "08:00 AM - 05:00 PM",
                "type": "class_end",
                "category": "Class Schedule",
                "badge_class": "badge-class-end",
                "course_name": t.course_name,
                "batch_label": t.batch_label,
                "trainer": t.trainer_name or "Assigned Trainer",
                "status": t.get_status_display(),
                "students": students_list,
                "details": f"Final day of training & class completion for {t.course_name} ({t.batch_label})."
            })

        # Assessment / Exam Date Event
        if t.assessment_at:
            events.append({
                "id": f"exam-{t.id}",
                "title": f"Exam / Assessment: {t.course_name}",
                "date": t.assessment_at.strftime("%Y-%m-%d"),
                "time": t.assessment_at.strftime("%I:%M %p"),
                "type": "exam",
                "category": "Exam & Assessment",
                "badge_class": "badge-exam",
                "course_name": t.course_name,
                "batch_label": t.batch_label,
                "trainer": t.trainer_name or "Assigned Trainer",
                "examiner": t.examiner_name or "TESDA Accredited Assessor",
                "status": "Scheduled",
                "students": students_list,
                "details": f"National Competency Assessment / Exam for {t.course_name} ({t.batch_label}). Assessor: {t.examiner_name or 'TESDA Representative'}."
            })

    # 2. Student Assigned Schedule Options (if student)
    if role == "student" and user:
        profile = getattr(user, "enrollment_profile", None)
        if profile and profile.preferred_schedule:
            opt = profile.preferred_schedule
            if opt.start_date:
                events.append({
                    "id": f"student-start-{opt.id}",
                    "title": f"My Class Start: {opt.course_name or profile.selected_program}",
                    "date": opt.start_date.strftime("%Y-%m-%d"),
                    "time": f"{opt.time_from} - {opt.time_to}",
                    "type": "class_start",
                    "category": "My Schedule",
                    "badge_class": "badge-class-start",
                    "course_name": opt.course_name or profile.selected_program,
                    "batch_label": opt.batch_label or "Batch 1",
                    "trainer": opt.trainer or "Assigned Trainer",
                    "details": f"Your assigned class starts today. Days: {opt.day}."
                })
            if opt.end_date:
                events.append({
                    "id": f"student-end-{opt.id}",
                    "title": f"My End of Class: {opt.course_name or profile.selected_program}",
                    "date": opt.end_date.strftime("%Y-%m-%d"),
                    "time": f"{opt.time_from} - {opt.time_to}",
                    "type": "class_end",
                    "category": "My Schedule",
                    "badge_class": "badge-class-end",
                    "course_name": opt.course_name or profile.selected_program,
                    "batch_label": opt.batch_label or "Batch 1",
                    "trainer": opt.trainer or "Assigned Trainer",
                    "details": f"Your assigned class ends today."
                })

    # 3. Add Institutional Academic & System Events
    today = date.today()
    current_year = today.year

    institutional_events = [
        {
            "id": "inst-1",
            "title": "Semester Enrollment Period Begins",
            "date": f"{current_year}-01-15",
            "time": "08:00 AM - 05:00 PM",
            "type": "enrollment",
            "category": "Academic Calendar",
            "badge_class": "badge-enrollment",
            "details": "Official opening of online & walk-in student registration for all NC programs."
        },
        {
            "id": "inst-2",
            "title": "New Student Orientation & Briefing",
            "date": f"{current_year}-05-10",
            "time": "09:00 AM - 12:00 PM",
            "type": "event",
            "category": "Institutional",
            "badge_class": "badge-event",
            "details": "Orientation for all newly enrolled students and trainees across all certification tracks."
        },
        {
            "id": "inst-3",
            "title": "Mid-Year National Assessment Week",
            "date": f"{current_year}-07-20",
            "time": "08:00 AM - 05:00 PM",
            "type": "exam",
            "category": "Exam & Assessment",
            "badge_class": "badge-exam",
            "details": "Institutional competency assessment week for all completed training batches."
        },
        {
            "id": "inst-4",
            "title": "Year-End Graduation & Certification Ceremony",
            "date": f"{current_year}-11-28",
            "time": "01:00 PM - 05:00 PM",
            "type": "event",
            "category": "Institutional",
            "badge_class": "badge-event",
            "details": "Commencement exercises and awarding of TESDA National Certificates."
        }
    ]

    events.extend(institutional_events)

    # Sort events by date
    events.sort(key=lambda x: x["date"])
    return events
