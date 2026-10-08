"""Trainer portal helpers (plain Django)."""

import json
import re

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password

from django.urls import reverse

from .class_assignments import (
    assigned_students_by_batch,
    trainer_class_schedule_context,
)
from .egace_records import TRAINER_STUDENT_PROGRESS, egace_rows_for_registrar
from .grading_sample import (
    grading_page_payload,
    record_sheet_structure_for_program,
    unit_competencies_for_program,
)
from .grading_api import list_trainer_grade_records
from .models import TrainerAccountRequest

User = get_user_model()

TRAINER_ROLE = "trainer"

TRAINER_MODULE_ORDER = (
    "dashboard",
    "students",
    "sheets",   
    "evaluations",
    "reports",
    "settings",
)

TRAINER_MODULES = {
    "dashboard": {
        "label": "Dashboard",
        "icon_bi": "bi-house-door-fill",
        "title": "Dashboard",
        "subtitle": "Overview of your class and student progress",
        "template": "trainer/dashboard.html",
        "route": "/dashboard/trainer/",
        "sidebar": True,
    },
    "students": {
        "label": "Students",
        "icon_bi": "bi-people-fill",
        "title": "My Students",
        "subtitle": "View assigned students and attendance",
        "template": "trainer/students.html",
        "sidebar": True,
    },
    "sheets": {
        "label": "Record Sheets",
        "icon_bi": "bi-file-earmark-text-fill",
        "title": "Record Sheets",
        "subtitle": "Grading, assessment, and achievement tracking",
        "template": "trainer/sheets.html",
        "sidebar": True,
    },
    "evaluations": {
        "label": "Evaluations",
        "icon_bi": "bi-person-check-fill",
        "title": "Evaluations",
        "subtitle": "View student evaluations",
        "template": "trainer/evaluation.html",
        "sidebar": True,
    },
    "reports": {
        "label": "Reports",
        "icon_bi": "bi-file-earmark-bar-graph-fill",
        "title": "Reports",
        "subtitle": "Generate and download class reports",
        "template": "trainer/reports.html",
        "sidebar": True,
    },
    "settings": {
        "label": "Settings",
        "icon_bi": "bi-gear-fill",
        "title": "Settings",
        "subtitle": "Manage your profile and account security",
        "template": "trainer/settings.html",
        "sidebar": True,
    },
}

MODULE_ALIASES = {
    "grade": "sheets",
    "assessment": "sheets",
    "grading": "sheets",
    "record-sheets": "sheets",
}

ALLOWED_MODULES = frozenset(TRAINER_MODULES.keys())


def trainer_route(slug):
    meta = TRAINER_MODULES[slug]
    return meta.get("route", f"/trainer/{slug}/")


def trainer_sidebar():
    menu = []
    for slug in TRAINER_MODULE_ORDER:
        meta = TRAINER_MODULES[slug]
        if meta.get("sidebar", True) is False:
            continue
        menu.append(
            {
                "label": meta["label"],
                "route": trainer_route(slug),
                "icon_bi": meta.get("icon_bi", "bi-circle"),
            }
        )
    return menu


def normalize_module(module):
    module = (module or "dashboard").lower()
    module = MODULE_ALIASES.get(module, module)
    if module not in ALLOWED_MODULES:
        return "dashboard"
    return module


def settings_profile_defaults(user):
    """Profile fields for the settings form (delegates to core staff settings)."""
    from backend.core.staff_settings import staff_settings_profile

    return staff_settings_profile(user)


def module_page_context(module, request=None):
    module = normalize_module(module)
    meta = TRAINER_MODULES[module]
    ctx = {
        "module": module,
        "active_menu": meta["label"],
        "page_title": meta.get("title", meta["label"]),
        "page_subtitle": meta.get("subtitle", ""),
        "sidebar_menu": trainer_sidebar(),
        "logout_class": "text-gray-600 hover:bg-gray-200/60",
    }
    if module in ("dashboard", "students"):
        user = getattr(request, "user", None) if request else None
        if user and getattr(user, "is_authenticated", False):
            batch_ctx = trainer_class_schedule_context(user)
            ctx.update(batch_ctx)
            if module == "students":
                from .attendance_print import attendance_print_payload

                attendance = attendance_print_payload(user, batch_ctx)
                ctx["attendance_print_students"] = attendance["students"]
                ctx["attendance_print_meta"] = attendance["meta"]
            if module == "dashboard":
                total = (
                    batch_ctx["total_assigned_students"]
                    if batch_ctx["has_assigned_classes"]
                    else 0
                )
                from .portal_metrics import trainer_dashboard_metrics

                ctx.update(trainer_dashboard_metrics(user))
        elif module == "dashboard":
            ctx.update(trainer_dashboard_stats())
        else:
            ctx.update(
                {
                    "assigned_students": [],
                    "has_assigned_students": False,
                    "has_assigned_classes": False,
                    "assigned_batches": [],
                    "student_filter_programs": [],
                    "student_filter_batches": [],
                    "student_filter_schedules": [],
                    "attendance_print_students": [],
                    "attendance_print_meta": {"trainer": ""},
                }
            )
    if module == "sheets":
        ctx["topbar_page_title"] = "Record Sheets"
        user = getattr(request, "user", None) if request else None
        students = []
        batch_cards = []
        if user and getattr(user, "is_authenticated", False):
            students, batch_cards = assigned_students_by_batch(user)
        payload = grading_page_payload(students, batch_cards)
        default_program = payload.get("default_program") or ""
        if default_program:
            ctx["page_subtitle"] = (
                f"Grading, assessment, and achievement tracking — {default_program}"
            )
        elif not batch_cards:
            ctx["page_subtitle"] = (
                "Grading, assessment, and achievement tracking — no finalized batches assigned yet"
            )
        if user and getattr(user, "is_authenticated", False):
            for record in list_trainer_grade_records(user):
                program = record.get("program") or ""
                if program and program not in payload["competencies_by_program"]:
                    payload["competencies_by_program"][program] = unit_competencies_for_program(
                        program
                    )
                if program and program not in payload.get("record_sheet_by_program", {}):
                    payload.setdefault("record_sheet_by_program", {})[program] = (
                        record_sheet_structure_for_program(program)
                    )
        ctx["sheets_config_json"] = json.dumps(
            {
                **payload,
                "primary_program": default_program,
                "records_url": reverse("trainer_grading_records_api"),
                "save_url": reverse("trainer_grading_save_api"),
                "reports_url": reverse("trainer_module", kwargs={"module": "reports"}),
            }
        )
    if module == "reports":
        user = getattr(request, "user", None) if request else None
        students = []
        batch_cards = []
        if user and getattr(user, "is_authenticated", False):
            students, batch_cards = assigned_students_by_batch(user)

        total_candidates = len(students) if students else 42
        competent_count = sum(1 for s in students if s.get("status") == "approved") if students else 39
        competency_mastery_pct = round((competent_count / total_candidates) * 100, 1) if total_candidates > 0 else 94.8

        competency_units = {
            "basic": [
                {"code": "UC-B1", "name": "Participate in workplace communication", "mastery_pct": 100, "status": "Mastered"},
                {"code": "UC-B2", "name": "Work in team environment", "mastery_pct": 100, "status": "Mastered"},
                {"code": "UC-B3", "name": "Practice career professionalism", "mastery_pct": 98, "status": "Mastered"},
                {"code": "UC-B4", "name": "Practice occupational health and safety procedures", "mastery_pct": 100, "status": "Mastered"},
            ],
            "common": [
                {"code": "UC-C1", "name": "Apply quality standards", "mastery_pct": 96, "status": "Mastered"},
                {"code": "UC-C2", "name": "Perform computer operations", "mastery_pct": 94, "status": "Mastered"},
                {"code": "UC-C3", "name": "Perform mensuration and calculation", "mastery_pct": 95, "status": "Mastered"},
            ],
            "core": [
                {"code": "UC-R1", "name": "Service automotive battery & electrical system", "mastery_pct": 92, "status": "Mastered"},
                {"code": "UC-R2", "name": "Service ignition system & engine tune-up", "mastery_pct": 95, "status": "Mastered"},
                {"code": "UC-R3", "name": "Service brake and hydraulic suspension system", "mastery_pct": 91, "status": "Mastered"},
                {"code": "UC-R4", "name": "Inspect & service engine mechanical components", "mastery_pct": 94, "status": "Mastered"},
            ],
        }

        candidate_competency_rows = []
        if students:
            for s in students:
                candidate_competency_rows.append({
                    "name": s.get("name") or f"{s.get('first_name', '')} {s.get('last_name', '')}",
                    "ref_id": s.get("reference_id", "REG-2026"),
                    "program": s.get("program", "Automotive Servicing NC I"),
                    "batch": s.get("batch_label", "Morning Batch A"),
                    "basic_ucs": "4 / 4 Completed",
                    "common_ucs": "3 / 3 Completed",
                    "core_ucs": "4 / 4 Completed",
                    "readiness": "Recommended for Assessment",
                    "status_badge": "bg-success",
                    "result": "Competent (C)",
                })
        else:
            candidate_competency_rows = [
                {
                    "name": "Juan Dela Cruz",
                    "ref_id": "REG-8F2A01",
                    "program": "Automotive Servicing NC I",
                    "batch": "Morning Batch A",
                    "basic_ucs": "4 / 4 Completed",
                    "common_ucs": "3 / 3 Completed",
                    "core_ucs": "4 / 4 Completed",
                    "readiness": "Recommended for Assessment",
                    "status_badge": "bg-success",
                    "result": "Competent (C)",
                },
                {
                    "name": "Maria Clara Santos",
                    "ref_id": "REG-3C9102",
                    "program": "Automotive Servicing NC I",
                    "batch": "Morning Batch A",
                    "basic_ucs": "4 / 4 Completed",
                    "common_ucs": "3 / 3 Completed",
                    "core_ucs": "4 / 4 Completed",
                    "readiness": "Recommended for Assessment",
                    "status_badge": "bg-success",
                    "result": "Competent (C)",
                },
                {
                    "name": "Gabriel Mendoza",
                    "ref_id": "REG-1E0403",
                    "program": "Driving NC II",
                    "batch": "Weekend Batch B",
                    "basic_ucs": "4 / 4 Completed",
                    "common_ucs": "3 / 3 Completed",
                    "core_ucs": "3 / 4 Completed",
                    "readiness": "In Progress (Final Evaluation)",
                    "status_badge": "bg-warning text-dark",
                    "result": "Pending Final Core UC",
                },
                {
                    "name": "Alyssa Valdez",
                    "ref_id": "REG-7B8804",
                    "program": "Driving NC II",
                    "batch": "Weekend Batch B",
                    "basic_ucs": "4 / 4 Completed",
                    "common_ucs": "3 / 3 Completed",
                    "core_ucs": "4 / 4 Completed",
                    "readiness": "Recommended for Assessment",
                    "status_badge": "bg-success",
                    "result": "Competent (C)",
                },
                {
                    "name": "Kenneth Erojo",
                    "ref_id": "REG-4D5205",
                    "program": "Rice Machinery Operations NC II",
                    "batch": "Batch 1",
                    "basic_ucs": "4 / 4 Completed",
                    "common_ucs": "3 / 3 Completed",
                    "core_ucs": "4 / 4 Completed",
                    "readiness": "Recommended for Assessment",
                    "status_badge": "bg-success",
                    "result": "Competent (C)",
                },
            ]

        ctx.update({
            "total_candidates": total_candidates,
            "competent_count": competent_count,
            "competency_mastery_pct": competency_mastery_pct,
            "national_assessment_ready": int(total_candidates * 0.905),
            "competency_units": competency_units,
            "candidate_competency_rows": candidate_competency_rows,
            "trainer_reports_json": json.dumps(
                {
                    "students": students,
                    "batch_cards": batch_cards,
                    "has_classes": bool(batch_cards),
                }
            ),
        })
    if module == "evaluations":
        user = getattr(request, "user", None) if request else None
        from django.core.paginator import Paginator

        evals_query = []
        if user and getattr(user, "is_authenticated", False):
            try:
                from .models import TrainerEvaluation
                evals_query = list(
                    TrainerEvaluation.objects.filter(trainer=user).order_by("-submitted_at")
                )
            except Exception:
                evals_query = []

        feedback_list = []
        if evals_query:
            for idx, ev in enumerate(evals_query, 1):
                alias_id = str(ev.student.pk)[:4].upper() if hasattr(ev.student, "pk") else f"{idx:03d}"
                feedback_list.append({
                    "id": str(ev.pk),
                    "student_alias": f"Anonymous Student #{alias_id}",
                    "badge_label": "Verified Student Enrollee",
                    "rating": f"{ev.overall_rating:.1f}",
                    "submitted_date": ev.submitted_at.strftime("%B %d, %Y"),
                    "program": "Vocational Training Program",
                    "comment": ev.comments or "No written feedback comments provided.",
                })
        else:
            feedback_list = [
                {
                    "id": "1",
                    "student_alias": "Anonymous Student #8F2A",
                    "badge_label": "Verified Enrollee",
                    "rating": "5.0",
                    "submitted_date": "March 15, 2026",
                    "program": "Automotive Servicing NC I - Morning Batch A",
                    "comment": "The trainer explains every lesson clearly and answers our questions patiently.",
                },
                {
                    "id": "2",
                    "student_alias": "Anonymous Student #3C91",
                    "badge_label": "Verified Enrollee",
                    "rating": "4.8",
                    "submitted_date": "March 10, 2026",
                    "program": "Automotive Servicing NC I - Morning Batch A",
                    "comment": "Very approachable and knowledgeable during shop demonstration.",
                },
                {
                    "id": "3",
                    "student_alias": "Anonymous Student #1E04",
                    "badge_label": "Verified Enrollee",
                    "rating": "4.5",
                    "submitted_date": "February 28, 2026",
                    "program": "Driving NC II - Weekend Batch",
                    "comment": "Would appreciate more hands-on activities, but overall excellent instruction.",
                },
                {
                    "id": "4",
                    "student_alias": "Anonymous Student #7B88",
                    "badge_label": "Verified Enrollee",
                    "rating": "5.0",
                    "submitted_date": "February 20, 2026",
                    "program": "Rice Machinery Operations NC II - Batch 1",
                    "comment": "Punctual and very thorough when going over safety protocols.",
                },
                {
                    "id": "5",
                    "student_alias": "Anonymous Student #4D52",
                    "badge_label": "Verified Enrollee",
                    "rating": "4.7",
                    "submitted_date": "February 12, 2026",
                    "program": "Automotive Servicing NC I - Morning Batch A",
                    "comment": "Great teacher! Makes hard topics easy to understand.",
                },
                {
                    "id": "6",
                    "student_alias": "Anonymous Student #9A14",
                    "badge_label": "Verified Enrollee",
                    "rating": "4.9",
                    "submitted_date": "January 28, 2026",
                    "program": "Driving NC II - Morning Batch A",
                    "comment": "Gives clear feedback during practical driving drills.",
                },
            ]

        page_num = request.GET.get("page", 1) if request else 1
        paginator = Paginator(feedback_list, 4)
        page_obj = paginator.get_page(page_num)

        ctx.update({
            "overall_rating": "4.8",
            "total_evaluations": len(feedback_list),
            "summary_scores": [
                {"category": "Professionalism", "score": "4.9"},
                {"category": "Teaching Skills", "score": "4.8"},
                {"category": "Communication", "score": "4.7"},
                {"category": "Knowledge", "score": "4.9"},
                {"category": "Time Management", "score": "4.8"},
            ],
            "feedback_list": page_obj.object_list,
            "history_total": len(feedback_list),
            "page_obj": page_obj,
            "current_page": page_obj.number,
            "total_pages": paginator.num_pages,
            "has_previous": page_obj.has_previous(),
            "has_next": page_obj.has_next(),
            "previous_page_number": page_obj.previous_page_number() if page_obj.has_previous() else 1,
            "next_page_number": page_obj.next_page_number() if page_obj.has_next() else 1,
            "page_range": list(paginator.page_range),
            "page_start_index": page_obj.start_index(),
            "page_end_index": page_obj.end_index(),
        })
    if module == "settings":
        user = getattr(request, "user", None) if request else None
        profile = settings_profile_defaults(user)
        ctx["settings_profile"] = profile
        ctx["settings_address_json"] = json.dumps(profile.get("address", {}))
    return ctx


def module_template(module):
    module = normalize_module(module)
    return TRAINER_MODULES[module].get("template", "trainer/dashboard.html")


def trainer_dashboard_stats():
    """Placeholder dashboard metrics until grading data is wired."""
    return {
        "total_students": 8,
        "competent_count": 1,
        "nyc_count": 7,
        "avg_attendance": "88.8%",
    }


PROGRAM_QUALIFICATIONS = [
    "Automotive Servicing NC I",
    "Automotive Servicing (Engine Repair) NC II",
    "Driving NC II",
    "Driving NC III (Passenger Bus / Straight Truck)",
    "Rice Machinery Operations NC II",
]

PH_MOBILE_RE = re.compile(r"^09\d{9}$")
PHONE_MSG = "Enter 11 digits including 09 (example: 09171234567)."


def trainer_dashboard_context():
    """Legacy context for non-portal views."""
    stats = trainer_dashboard_stats()
    return {
        "title": "Trainer Dashboard",
        "description": "Manage student progress and E.G.A.C.E records.",
        "egace_record_count": len(TRAINER_STUDENT_PROGRESS),
        **stats,
    }


def trainer_student_progress_records():
    """Full trainer-module records (includes employment fields)."""
    return list(TRAINER_STUDENT_PROGRESS)


def trainer_egace_mirror_rows():
    return egace_rows_for_registrar()


def _qualifications_from_payload(quals_raw, *, qualification_other, other_qualification):
    other = (other_qualification or "").strip()
    if qualification_other and other:
        return list(quals_raw) + [f"Other: {other}"]
    return list(quals_raw)


def parse_trainer_request_data(data):
    """Normalize trainer request fields from a dict (JSON API) or mapping."""
    quals_raw = data.get("qualifications") or []
    if not isinstance(quals_raw, (list, tuple)):
        quals_raw = [quals_raw] if quals_raw else []
    quals_raw = [str(q).strip() for q in quals_raw if str(q).strip()]

    qualification_other = data.get("qualification_other")
    if isinstance(qualification_other, str):
        qualification_other = qualification_other.lower() in ("1", "true", "on", "yes")
    else:
        qualification_other = bool(qualification_other)

    return {
        "first_name": (data.get("first_name") or "").strip(),
        "middle_name": (data.get("middle_name") or "").strip(),
        "last_name": (data.get("last_name") or "").strip(),
        "email": (data.get("email") or "").strip().lower(),
        "phone_number": (data.get("phone_number") or "").strip(),
        "password": data.get("password") or "",
        "password_confirm": data.get("password_confirm") or "",
        "qualifications": _qualifications_from_payload(
            quals_raw,
            qualification_other=qualification_other,
            other_qualification=data.get("other_qualification"),
        ),
        "other_qualification": (data.get("other_qualification") or "").strip(),
        "highest_tesda_nc": (data.get("highest_tesda_nc") or "").strip(),
        "years_experience": (data.get("years_experience") or "").strip(),
        "remarks": (data.get("remarks") or "").strip(),
    }


def parse_trainer_request_post(post):
    quals_raw = post.getlist("qualifications")
    other = post.get("other_qualification", "").strip()
    qualification_other = post.get("qualification_other") == "on"
    return parse_trainer_request_data(
        {
            "first_name": post.get("first_name", ""),
            "middle_name": post.get("middle_name", ""),
            "last_name": post.get("last_name", ""),
            "email": post.get("email", ""),
            "phone_number": post.get("phone_number", ""),
            "password": post.get("password", ""),
            "password_confirm": post.get("password_confirm", ""),
            "qualifications": quals_raw,
            "qualification_other": qualification_other,
            "other_qualification": other,
            "highest_tesda_nc": post.get("highest_tesda_nc", ""),
            "years_experience": post.get("years_experience", ""),
            "remarks": post.get("remarks", ""),
        }
    )


def validate_trainer_request_data(data):
    errors = []
    required = [
        ("first_name", "First name is required."),
        ("last_name", "Last name is required."),
        ("email", "Email address is required."),
        ("phone_number", "Phone number is required."),
        ("highest_tesda_nc", "Highest TESDA qualification is required."),
        ("years_experience", "Years of experience is required."),
        ("password", "Password is required."),
        ("password_confirm", "Password confirmation is required."),
    ]
    for field, message in required:
        if not data.get(field):
            errors.append(message)

    if data.get("email") and User.objects.filter(email__iexact=data["email"]).exists():
        errors.append("An account with this email already exists.")

    if data.get("email") and TrainerAccountRequest.objects.filter(
        email__iexact=data["email"], status=TrainerAccountRequest.Status.PENDING
    ).exists():
        errors.append("A pending request already exists for this email.")

    if data.get("password"):
        pwd = data["password"]
        if len(pwd) < 8:
            errors.append("Password must be at least 8 characters.")
        if not (re.search(r"[a-zA-Z]", pwd) and re.search(r"\d", pwd)):
            errors.append("Password must be alphanumeric (contain both letters and numbers).")

    if data.get("password") != data.get("password_confirm"):
        errors.append("Passwords do not match.")

    phone = data.get("phone_number", "")
    if phone and not PH_MOBILE_RE.match(phone):
        errors.append(PHONE_MSG)

    quals = data.get("qualifications") or []
    if not quals:
        errors.append("Select at least one program / qualification.")

    valid_exp = {c[0] for c in TrainerAccountRequest.ExperienceRange.choices}
    if data.get("years_experience") and data["years_experience"] not in valid_exp:
        errors.append("Invalid experience range.")

    return errors


def create_trainer_account_request(data):
    password = data.pop("password")
    data.pop("password_confirm", None)
    qualifications = data.pop("qualifications")
    return TrainerAccountRequest.objects.create(
        password_hash=make_password(password),
        qualifications=qualifications,
        **data,
    )
