"""Calendar Event Services for All Portal Dashboards."""

from datetime import datetime, date
from django.utils import timezone
from django.db import models
from backend.registrar.models import RegistrarScheduleTemplate
from backend.student.models import (
    StudentRegistration,
    StudentEnrollmentProfile,
    StudentScheduleOption,
)


def get_calendar_events_for_user(user=None, role="admin"):
    """
    Returns a structured list of calendar events formatted for dashboard consumption.
    Role can be 'admin', 'registrar', 'cashier', 'student', or 'trainer'.

    Access Scoping Rules:
    - Admin & Registrar: Can see ALL batches, schedules, and events across the entire institution.
    - Trainer: Can ONLY see batches and classes assigned to this trainer (plus institutional events).
    - Student: Can ONLY see the specific batch and schedule they are enrolled in (plus institutional events).
    """
    events = []
    role = (role or "admin").strip().lower()

    # 1. Base Registrar Schedule Templates query
    templates = RegistrarScheduleTemplate.objects.all()

    if role in ("admin", "registrar", "cashier"):
        # Admin and Registrar can see all batches and full student rosters
        show_roster = True
    elif role == "trainer":
        show_roster = True
        if user and getattr(user, "is_authenticated", False):
            from backend.trainer.class_assignments import (
                trainer_account_request_for_user,
                _trainer_name_for_lookup,
            )

            trainer_req = trainer_account_request_for_user(user)
            name = _trainer_name_for_lookup(trainer_req, user)
            user_full = (user.get_full_name() or "").strip()

            q_filter = models.Q(created_by=user)
            if trainer_req:
                q_filter |= models.Q(trainer_request=trainer_req)
            if name:
                q_filter |= models.Q(trainer_name__iexact=name) | models.Q(trainer_name__icontains=name)
            if user_full and user_full.lower() != (name or "").lower():
                q_filter |= models.Q(trainer_name__iexact=user_full) | models.Q(trainer_name__icontains=user_full)

            templates = templates.filter(q_filter)
        else:
            templates = templates.none()

    elif role == "candidate":
        # Candidates can only see their own assigned assessment batch schedule, no peer roster
        show_roster = False
        if user and getattr(user, "is_authenticated", False):
            candidate_email = getattr(user, "email", "").strip().lower()
            reg = (
                getattr(user, "registration_application", None)
                or StudentRegistration.objects.filter(
                    models.Q(user=user) | models.Q(email__iexact=candidate_email)
                ).first()
            )
            ref_id = (reg.reference_id if reg else "").strip()
            user_full = (user.get_full_name() or "").strip().lower()
            selected_prog = (reg.selected_program if reg else "").strip().lower()

            matching_ids = []
            for t in templates:
                is_in_snapshot = False
                if isinstance(t.students_snapshot, list) and t.students_snapshot:
                    for entry in t.students_snapshot:
                        e_email = (entry.get("email") or "").strip().lower()
                        e_ref = (entry.get("referenceId") or entry.get("reference_id") or "").strip()
                        e_name = (entry.get("fullName") or "").strip().lower()
                        if (
                            (e_email and e_email == candidate_email)
                            or (ref_id and e_ref and e_ref.lower() == ref_id.lower())
                            or (user_full and e_name and e_name == user_full)
                        ):
                            is_in_snapshot = True
                            break

                if is_in_snapshot:
                    matching_ids.append(t.id)
                elif selected_prog and t.course_name and t.course_name.strip().lower() == selected_prog:
                    if t.batch_kind == "national_assessment" or t.assessment_at:
                        matching_ids.append(t.id)

            templates = templates.filter(id__in=matching_ids)
        else:
            templates = templates.none()
    elif role == "student":
        # Students can only see their own assigned batch schedule, no peer roster
        show_roster = False
        if user and getattr(user, "is_authenticated", False):
            student_email = getattr(user, "email", "").strip().lower()
            reg = (
                getattr(user, "registration_application", None)
                or StudentRegistration.objects.filter(
                    models.Q(user=user) | models.Q(email__iexact=student_email)
                ).first()
            )
            profile = (
                getattr(user, "enrollment_profile", None)
                or StudentEnrollmentProfile.objects.filter(
                    models.Q(user=user) | models.Q(email__iexact=student_email)
                ).first()
            )

            ref_id = (reg.reference_id if reg else "").strip()
            user_full = (user.get_full_name() or "").strip().lower()

            matching_ids = []
            for t in templates:
                is_in_snapshot = False
                if isinstance(t.students_snapshot, list) and t.students_snapshot:
                    for entry in t.students_snapshot:
                        e_email = (entry.get("email") or "").strip().lower()
                        e_ref = (entry.get("referenceId") or entry.get("reference_id") or "").strip()
                        e_name = (entry.get("fullName") or "").strip().lower()
                        if (
                            (e_email and e_email == student_email)
                            or (ref_id and e_ref and e_ref.lower() == ref_id.lower())
                            or (user_full and e_name and e_name == user_full)
                        ):
                            is_in_snapshot = True
                            break

                if is_in_snapshot:
                    matching_ids.append(t.id)

            # Fallback: if not in snapshot, check preferred_schedule exact batch assignment
            if not matching_ids and profile and profile.preferred_schedule:
                ps = profile.preferred_schedule
                for t in templates:
                    if (
                        ps.course_name
                        and t.course_name.strip().lower() == ps.course_name.strip().lower()
                        and (not ps.batch_label or t.batch_label.strip().lower() == ps.batch_label.strip().lower())
                    ):
                        matching_ids.append(t.id)
                        break

            templates = templates.filter(id__in=matching_ids)
        else:
            templates = templates.none()
    else:
        show_roster = False
        templates = templates.none()

    has_matched_template = False
    for t in templates:
        has_matched_template = True
        # Enrolled students for batch snapshot if staff/trainer
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
        if t.available_from and role != "candidate":
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
        if t.available_until and role != "candidate":
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
            title_prefix = "National Assessment" if role == "candidate" else "Exam / Assessment"
            category_label = "National Assessment" if role == "candidate" else "Exam & Assessment"
            details_text = (
                f"TESDA National Competency Assessment for {t.course_name} ({t.batch_label}). Venue: Room 302 Practical Assessment Lab. Assessor: {t.examiner_name or 'TESDA Representative'}."
                if role == "candidate"
                else f"National Competency Assessment / Exam for {t.course_name} ({t.batch_label}). Assessor: {t.examiner_name or 'TESDA Representative'}."
            )
            events.append({
                "id": f"exam-{t.id}",
                "title": f"{title_prefix}: {t.course_name}",
                "date": t.assessment_at.strftime("%Y-%m-%d"),
                "time": t.assessment_at.strftime("%I:%M %p"),
                "type": "exam",
                "category": category_label,
                "badge_class": "badge-exam",
                "course_name": t.course_name,
                "batch_label": t.batch_label,
                "trainer": t.trainer_name or ("Assigned Assessor" if role == "candidate" else "Assigned Trainer"),
                "examiner": t.examiner_name or "TESDA Accredited Assessor",
                "status": "Scheduled",
                "students": students_list,
                "details": details_text,
            })

    # 2. Student Assigned Schedule Options (Fallback ONLY if student has preferred_schedule and no matched template)
    if role == "student" and user and not has_matched_template:
        profile = getattr(user, "enrollment_profile", None)
        if profile and profile.preferred_schedule:
            opt = profile.preferred_schedule
            course_title = opt.course_name or profile.selected_program or "Training Course"
            batch_title = opt.batch_label or "Batch 1"
            if opt.start_date:
                events.append({
                    "id": f"student-start-{opt.id}",
                    "title": f"Start of Class: {course_title} ({batch_title})",
                    "date": opt.start_date.strftime("%Y-%m-%d"),
                    "time": f"{opt.time_from} - {opt.time_to}" if opt.time_from and opt.time_to else "08:00 AM - 05:00 PM",
                    "type": "class_start",
                    "category": "Class Schedule",
                    "badge_class": "badge-class-start",
                    "course_name": course_title,
                    "batch_label": batch_title,
                    "trainer": opt.trainer or "Assigned Trainer",
                    "students": [],
                    "details": f"Your assigned class starts today. Days: {opt.day}."
                })
            if opt.end_date:
                events.append({
                    "id": f"student-end-{opt.id}",
                    "title": f"End of Class: {course_title} ({batch_title})",
                    "date": opt.end_date.strftime("%Y-%m-%d"),
                    "time": f"{opt.time_from} - {opt.time_to}" if opt.time_from and opt.time_to else "08:00 AM - 05:00 PM",
                    "type": "class_end",
                    "category": "Class Schedule",
                    "badge_class": "badge-class-end",
                    "course_name": course_title,
                    "batch_label": batch_title,
                    "trainer": opt.trainer or "Assigned Trainer",
                    "students": [],
                    "details": "Your assigned class ends today."
                })

    # 3. Add Institutional Academic & System Events
    today = date.today()
    current_year = today.year

    if role == "candidate":
        institutional_events = [
            {
                "id": "inst-cand-1",
                "title": "National Competency Assessment Application & Registration",
                "date": f"{current_year}-01-15",
                "time": "08:00 AM - 05:00 PM",
                "type": "enrollment",
                "category": "Assessment Calendar",
                "badge_class": "badge-enrollment",
                "course_name": "Institutional",
                "batch_label": "Institutional",
                "details": "Opening of national assessment applications and documentary submission for candidates.",
            },
            {
                "id": "ann-cand-1",
                "title": "Announcement: Assessment Admission Slips Releasing",
                "date": f"{current_year}-04-02",
                "time": "08:00 AM - 05:00 PM",
                "type": "event",
                "category": "Assessment Announcement",
                "badge_class": "badge-event",
                "course_name": "Institutional",
                "batch_label": "All Candidates",
                "details": "Admission slips release for cleared candidates. Please verify your clearance status in the portal.",
            },
            {
                "id": "ann-cand-2",
                "title": "Announcement: National Assessment Guidelines & Orientation",
                "date": f"{current_year}-04-05",
                "time": "09:00 AM - 11:30 AM",
                "type": "event",
                "category": "Assessment Announcement",
                "badge_class": "badge-event",
                "course_name": "Institutional",
                "batch_label": "All Candidates",
                "details": "Mandatory briefing on examination rules, PPE, and test center health & safety compliance.",
            },
            {
                "id": "inst-cand-2",
                "title": "Mid-Year National Assessment Week",
                "date": f"{current_year}-07-20",
                "time": "08:00 AM - 05:00 PM",
                "type": "exam",
                "category": "National Assessment",
                "badge_class": "badge-exam",
                "course_name": "Institutional",
                "batch_label": "Institutional",
                "details": "Institutional competency assessment week across all accredited qualifications and testing labs.",
            },
        ]
    else:
        institutional_events = [
            {
                "id": "inst-1",
                "title": "Semester Enrollment Period Begins",
                "date": f"{current_year}-01-15",
                "time": "08:00 AM - 05:00 PM",
                "type": "enrollment",
                "category": "Academic Calendar",
                "badge_class": "badge-enrollment",
                "course_name": "Institutional",
                "batch_label": "Institutional",
                "details": "Official opening of online & walk-in student registration for all NC programs.",
            },
            {
                "id": "inst-2",
                "title": "New Student Orientation & Briefing",
                "date": f"{current_year}-05-10",
                "time": "09:00 AM - 12:00 PM",
                "type": "event",
                "category": "Institutional",
                "badge_class": "badge-event",
                "course_name": "Institutional",
                "batch_label": "Institutional",
                "details": "Orientation for all newly enrolled students and trainees across all certification tracks.",
            },
            {
                "id": "inst-3",
                "title": "Mid-Year National Assessment Week",
                "date": f"{current_year}-07-20",
                "time": "08:00 AM - 05:00 PM",
                "type": "exam",
                "category": "Exam & Assessment",
                "badge_class": "badge-exam",
                "course_name": "Institutional",
                "batch_label": "Institutional",
                "details": "Institutional competency assessment week for all completed training batches.",
            },
            {
                "id": "inst-4",
                "title": "Year-End Graduation & Certification Ceremony",
                "date": f"{current_year}-11-28",
                "time": "01:00 PM - 05:00 PM",
                "type": "event",
                "category": "Institutional",
                "badge_class": "badge-event",
                "course_name": "Institutional",
                "batch_label": "Institutional",
                "details": "Commencement exercises and awarding of TESDA National Certificates.",
            },
        ]

    events.extend(institutional_events)

    # Sort events chronologically by date
    events.sort(key=lambda x: x["date"])
    return events
