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
        "icon_bi": "bi-award-fill",
        "title": "E.G.A.C.E. Performance Report",
        "subtitle": "Training & Institutional EGACE Performance Report",
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
        start = (request.GET.get("start_date") or "").strip() if request else ""
        end = (request.GET.get("end_date") or "").strip() if request else ""
        if user and getattr(user, "is_authenticated", False):
            batch_ctx = trainer_class_schedule_context(
                user,
                start_date=start or None,
                end_date=end or None,
            )
            ctx.update(batch_ctx)
            if module == "students":
                from .attendance_print import attendance_print_payload

                attendance = attendance_print_payload(user, batch_ctx)
                ctx["attendance_print_students"] = attendance["students"]
                ctx["attendance_print_meta"] = attendance["meta"]
            if module == "dashboard":
                from .portal_metrics import trainer_dashboard_metrics

                ctx.update(
                    trainer_dashboard_metrics(
                        user,
                        start_date=start or None,
                        end_date=end or None,
                    )
                )
                ctx["dashboard_filter_start"] = start
                ctx["dashboard_filter_end"] = end
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
        from .class_assignments import (
            trainer_account_request_for_user,
            finalized_batches_for_trainer,
            _trainer_name_for_lookup,
        )
        from .egace_progress import build_registrar_egace_rows

        trainer_req = trainer_account_request_for_user(user)
        trainer_name = _trainer_name_for_lookup(trainer_req, user) or (user.get_full_name() if user else "Trainer")

        # Batches assigned to this trainer
        batches_qs = finalized_batches_for_trainer(trainer_req, user=user)
        if not batches_qs.exists() and user:
            from backend.registrar.models import RegistrarScheduleTemplate
            user_full = (user.get_full_name() or "").strip()
            if user_full:
                batches_qs = RegistrarScheduleTemplate.objects.filter(
                    trainer_name__iexact=user_full
                ).order_by("-finalized_at", "-updated_at")

        egace_rows = build_registrar_egace_rows()

        trainer_students_refs = set()
        trainer_students_names = set()
        for b in batches_qs:
            b_students = b.students_snapshot if isinstance(b.students_snapshot, list) else []
            for s in b_students:
                if s.get("referenceId"):
                    trainer_students_refs.add(s.get("referenceId"))
                if s.get("fullName"):
                    trainer_students_names.add(s.get("fullName").strip().lower())

        trainer_egace_rows = [
            r for r in egace_rows
            if r.get("referenceId") in trainer_students_refs
            or r.get("studentName", "").strip().lower() in trainer_students_names
        ]

        # Group batches by course to assign sequential BATCH 1, BATCH 2 labels
        course_batch_counters = {}
        trainer_batch_reports = []
        for t in batches_qs.order_by("course_name", "id"):
            c_name = t.course_name or "General Training"
            course_batch_counters[c_name] = course_batch_counters.get(c_name, 0) + 1
            batch_num = course_batch_counters[c_name]

            t_students = t.students_snapshot if isinstance(t.students_snapshot, list) else []
            t_refs = {s.get("referenceId") for s in t_students if s.get("referenceId")}
            t_names = {s.get("fullName", "").strip().lower() for s in t_students if s.get("fullName")}
            matched_egace = [
                r for r in trainer_egace_rows
                if r.get("referenceId") in t_refs or r.get("studentName", "").strip().lower() in t_names
            ]

            has_scholar = any(
                s.get("scholarship") or s.get("scholarshipType") or s.get("scholarship_type")
                for s in t_students
            )
            modality = "SCHOLARS" if has_scholar else "NON-SCHOLARS"

            clean_batch = f"BATCH {batch_num}"

            start_iso = t.available_from.strftime("%Y-%m-%d") if t.available_from else (t.created_at.strftime("%Y-%m-%d") if t.created_at else "")
            end_iso = t.available_until.strftime("%Y-%m-%d") if t.available_until else ""
            b_year = t.available_from.year if t.available_from else (t.created_at.year if t.created_at else 2026)
            b_month = t.available_from.month if t.available_from else (t.created_at.month if t.created_at else 11)

            trainer_batch_reports.append({
                "id": t.id,
                "course_name": c_name,
                "batch_label": clean_batch,
                "modality": modality,
                "trainer_name": t.trainer_name or trainer_name,
                "examiner_name": t.examiner_name or "TESDA Assessor",
                "start_date": t.available_from.strftime("%m/%d/%Y") if t.available_from else "—",
                "end_date": t.available_until.strftime("%m/%d/%Y") if t.available_until else "—",
                "start_date_iso": start_iso,
                "end_date_iso": end_iso,
                "year": b_year,
                "month": b_month,
                "academic_year": t.academic_year,
                "assessment_date": t.assessment_at.strftime("%m/%d/%Y") if t.assessment_at else "TBA",
                "status": t.get_status_display(),
                "students_count": len(t_students),
                "graduates": sum(1 for r in matched_egace if r.get("graduate")),
                "assessed": sum(1 for r in matched_egace if r.get("assessment")),
                "certified": sum(1 for r in matched_egace if r.get("certificate")),
                "employed": sum(1 for r in matched_egace if r.get("employment")),
            })

        trainer_courses = []
        for b in trainer_batch_reports:
            c = b.get("course_name")
            if c and c not in trainer_courses:
                trainer_courses.append(c)

        ctx.update({
            "page_title": "E.G.A.C.E. Performance Report",
            "page_subtitle": f"Training & Institutional EGACE Performance Records for {trainer_name}",
            "trainer_name": trainer_name,
            "trainer_courses": trainer_courses,
            "reports_egace_data_json": trainer_egace_rows,
            "reports_batches_data_json": trainer_batch_reports,
            "trainer_courses_json": trainer_courses,
            "trainer_info_json": {
                "name": trainer_name,
                "title": "Trainer / TVET Instructor",
            },
        })
    if module == "evaluations":
        user = getattr(request, "user", None) if request else None
        from django.core.paginator import Paginator
        from .evaluation import get_trainer_evaluation_summary

        summary_data = get_trainer_evaluation_summary(user)
        feedback_list = summary_data["feedback_list"]

        page_num = request.GET.get("page", 1) if request else 1
        paginator = Paginator(feedback_list, 4)
        page_obj = paginator.get_page(page_num)

        ctx.update({
            "overall_rating": summary_data["overall_rating"],
            "star_string": summary_data["star_string"],
            "total_evaluations": summary_data["total_evaluations"],
            "summary_scores": summary_data["summary_scores"],
            "feedback_list": page_obj.object_list,
            "history_total": summary_data["history_total"],
            "page_obj": page_obj,
            "current_page": page_obj.number,
            "total_pages": paginator.num_pages,
            "has_previous": page_obj.has_previous(),
            "has_next": page_obj.has_next(),
            "previous_page_number": page_obj.previous_page_number() if page_obj.has_previous() else 1,
            "next_page_number": page_obj.next_page_number() if page_obj.has_next() else 1,
            "page_range": list(paginator.page_range),
            "page_start_index": page_obj.start_index() if feedback_list else 0,
            "page_end_index": page_obj.end_index() if feedback_list else 0,
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
    """Default dashboard metrics when no classes are assigned."""
    return {
        "total_students": 0,
        "competent_count": 0,
        "nyc_count": 0,
        "avg_attendance": "—",
    }


DEFAULT_PROGRAM_QUALIFICATIONS = [
    "Automotive Servicing NC I",
    "Automotive Servicing (Engine Repair) NC II",
    "Driving NC II",
    "Driving NC III (Passenger Bus / Straight Truck)",
    "Rice Machinery Operations NC II",
]


def get_active_program_qualifications() -> list[str]:
    """Dynamically return names of all active registered NC Programs for trainer qualification/assignment."""
    try:
        from backend.system_admin.models import NcProgram

        names = list(
            NcProgram.objects.filter(is_active=True)
            .order_by("sort_order", "name")
            .values_list("name", flat=True)
        )
        if names:
            return names
    except Exception:
        pass
    return list(DEFAULT_PROGRAM_QUALIFICATIONS)


class _DynamicProgramQualifications(list):
    """Dynamic list wrapper to preserve compatibility while querying active programs from the database."""

    def __iter__(self):
        return iter(get_active_program_qualifications())

    def __len__(self):
        return len(get_active_program_qualifications())

    def __getitem__(self, index):
        return get_active_program_qualifications()[index]

    def __contains__(self, item):
        return item in get_active_program_qualifications()


PROGRAM_QUALIFICATIONS = _DynamicProgramQualifications(DEFAULT_PROGRAM_QUALIFICATIONS)

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
