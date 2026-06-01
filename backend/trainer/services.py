"""Trainer portal helpers (plain Django)."""

import json
import re

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password

from django.urls import reverse

from .class_assignments import trainer_class_schedule_context
from .egace_records import TRAINER_STUDENT_PROGRESS, egace_rows_for_registrar
from .grading_sample import grading_page_payload, unit_competencies_for_program
from .grading_api import list_trainer_grade_records
from .models import TrainerAccountRequest

User = get_user_model()

TRAINER_ROLE = "trainer"

TRAINER_MODULE_ORDER = (
    "dashboard",
    "students",
    "sheets",
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
            if module == "dashboard":
                total = (
                    batch_ctx["total_assigned_students"]
                    if batch_ctx["has_assigned_classes"]
                    else 0
                )
                ctx.update(
                    {
                        "total_students": total,
                        "competent_count": 0,
                        "nyc_count": 0,
                        "avg_attendance": "—",
                    }
                )
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
                }
            )
    if module == "sheets":
        ctx["topbar_page_title"] = "Record Sheets"
        user = getattr(request, "user", None) if request else None
        students = []
        primary_program = ""
        if user and getattr(user, "is_authenticated", False):
            batch_ctx = trainer_class_schedule_context(user)
            students = batch_ctx.get("assigned_students") or []
            batches = batch_ctx.get("assigned_batches") or []
            if batches:
                primary_program = batches[0].get("course_name") or ""
        payload = grading_page_payload(students)
        if primary_program:
            ctx["page_subtitle"] = (
                f"Grading, assessment, and achievement tracking — {primary_program}"
            )
        if user and getattr(user, "is_authenticated", False):
            for record in list_trainer_grade_records(user):
                program = record.get("program") or ""
                if program and program not in payload["competencies_by_program"]:
                    payload["competencies_by_program"][program] = unit_competencies_for_program(
                        program
                    )
        ctx["sheets_config_json"] = json.dumps(
            {
                **payload,
                "primary_program": primary_program,
                "records_url": reverse("trainer_grading_records_api"),
                "save_url": reverse("trainer_grading_save_api"),
                "reports_url": reverse("trainer_module", kwargs={"module": "reports"}),
            }
        )
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


def parse_trainer_request_post(post):
    quals_raw = post.getlist("qualifications")
    other = post.get("other_qualification", "").strip()
    if post.get("qualification_other") == "on" and other:
        quals_raw = list(quals_raw) + [f"Other: {other}"]
    return {
        "first_name": post.get("first_name", "").strip(),
        "middle_name": post.get("middle_name", "").strip(),
        "last_name": post.get("last_name", "").strip(),
        "email": post.get("email", "").strip().lower(),
        "phone_number": post.get("phone_number", "").strip(),
        "password": post.get("password", ""),
        "password_confirm": post.get("password_confirm", ""),
        "qualifications": quals_raw,
        "other_qualification": other,
        "highest_tesda_nc": post.get("highest_tesda_nc", "").strip(),
        "years_experience": post.get("years_experience", "").strip(),
        "remarks": post.get("remarks", "").strip(),
    }


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

    if data.get("password") and len(data["password"]) < 8:
        errors.append("Password must be at least 8 characters.")

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
