"""Registrar portal page context (plain Django)."""

import json

REGISTRAR_ROLE = "registrar"

# Order preserved for sidebar display
REGISTRAR_MODULE_ORDER = (
    "dashboard",
    "student",
    "enrollment",
    "batching-scheduling",
    "finalized-batches",
    "scholarship",
    "trainer-approval",
    "egace-table",
    "reports",
    "settings",
)

REGISTRAR_MODULES = {
    "dashboard": {
        "label": "Dashboard",
        "icon_bi": "bi-grid-1x2-fill",
        "title": "Registrar Dashboard",
        "subtitle": "Manage student enrollment and registrar operations",
        "template": "registrar/dashboard.html",
    },
    "student": {
        "label": "Students",
        "icon_bi": "bi-people-fill",
        "title": "Student List",
        "subtitle": "View and manage all registered students",
        "template": "registrar/student.html",
    },
    "enrollment": {
        "label": "Enrollment",
        "icon_bi": "bi-person-check-fill",
        "badge_class": "registrar-badge-danger",
        "title": "Pending Enrollment Approval",
        "subtitle": "Review and approve students who have made payments",
        "template": "registrar/enrollment.html",
    },
    "batching-scheduling": {
        "label": "Batching & Scheduling",
        "icon_bi": "bi-calendar-week",
        "title": "Batching & Scheduling Management",
        "subtitle": "View program batches and create recurring schedule templates",
        "template": "registrar/batching_scheduling.html",
    },
    "finalized-batches": {
        "label": "Finalized Batches",
        "icon_bi": "bi-trophy",
        "title": "Finalized Batches",
        "subtitle": "View, edit, and finalize schedule batches saved from Batching & Scheduling",
        "template": "registrar/finalized_batches.html",
    },
    "scholarship": {
        "label": "Scholarship",
        "icon_bi": "bi-mortarboard",
        "title": "Scholarship Management",
        "subtitle": "Upload sponsor lists, parse Excel or PDF files, and integrate scholar records",
        "template": "registrar/scholarship.html",
    },
    "trainer-approval": {
        "label": "Trainer Account Approval",
        "icon_bi": "bi-person-badge",
        "badge_class": "registrar-badge-primary",
        "title": "Trainer Account Approval",
        "subtitle": "Review and approve trainer portal accounts",
        "template": "registrar/trainer_approval.html",
    },
    "egace-table": {
        "label": "E.G.A.C.E Table",
        "icon_bi": "bi-table",
        "title": "E.G.A.C.E Table",
        "subtitle": "Employment, Graduate, Assessment, Certified, Employment Tracking",
        "template": "registrar/egace_table.html",
    },
    "reports": {
        "label": "Reports",
        "icon_bi": "bi-bar-chart-line-fill",
        "title": "Registrar Reports",
        "subtitle": "View annual enrollment statistics and course distribution",
        "template": "registrar/reports.html",
    },
    "settings": {
        "label": "Settings",
        "icon_bi": "bi-gear-fill",
        "title": "Settings",
        "subtitle": "Manage your profile and account security",
        "template": "registrar/settings.html",
    },
}

MODULE_ALIASES = {
    "students": "student",
}

ALLOWED_MODULES = frozenset(REGISTRAR_MODULES.keys())


def batching_trainers_payload():
    """Approved trainer accounts with declared program qualifications."""
    from backend.trainer.models import TrainerAccountRequest

    trainers = []
    rows = TrainerAccountRequest.objects.filter(
        status=TrainerAccountRequest.Status.APPROVED
    ).order_by("last_name", "first_name")
    for row in rows:
        name = " ".join(
            part for part in [row.first_name, row.middle_name, row.last_name] if part
        ).strip()
        quals = row.qualifications if isinstance(row.qualifications, list) else []
        normalized = [q.strip() for q in quals if isinstance(q, str) and q.strip()]
        if row.other_qualification:
            normalized.append(f"Other: {row.other_qualification.strip()}")
        trainers.append(
            {
                "id": str(row.id),
                "name": name or row.email,
                "email": row.email,
                "qualifications": normalized,
            }
        )
    return trainers


def registrar_route(slug):
    return f"/registrar/{slug}/"


def registrar_sidebar():
    from .pending_enrollment import pending_enrollment_count
    from .trainer_approval import pending_trainer_requests_count

    pending_count = pending_enrollment_count()
    trainer_pending_count = pending_trainer_requests_count()
    menu = []
    for slug in REGISTRAR_MODULE_ORDER:
        meta = REGISTRAR_MODULES[slug]
        item = {
            "label": meta["label"],
            "route": registrar_route(slug),
            "icon_bi": meta.get("icon_bi", "bi-circle"),
        }
        badge = meta.get("badge")
        if slug == "enrollment" and pending_count:
            badge = str(pending_count)
        if slug == "trainer-approval" and trainer_pending_count:
            badge = str(trainer_pending_count)
        if badge:
            item["badge"] = badge
            item["badge_class"] = meta.get("badge_class", "bg-secondary")
        menu.append(item)
    return menu


def normalize_module(module):
    module = (module or "dashboard").lower()
    module = MODULE_ALIASES.get(module, module)
    if module not in ALLOWED_MODULES:
        return "dashboard"
    return module


def module_meta(module):
    return REGISTRAR_MODULES[normalize_module(module)]


def settings_profile_defaults(user):
    """Demo-friendly profile fields for the settings form."""
    address = {
        "region": "13",
        "province": "1339",
        "cityMunicipality": "133905",
        "barangay": "133905001",
        "streetHouse": "789 Registrar St",
    }
    if user and user.is_authenticated:
        return {
            "first_name": user.first_name or "Maria",
            "last_name": user.last_name or "Santos",
            "email": user.email or "maria.santos@valiant.edu",
            "phone": "+63 912 345 6789",
            "address": address,
        }
    return {
        "first_name": "Maria",
        "last_name": "Santos",
        "email": "maria.santos@valiant.edu",
        "phone": "+63 912 345 6789",
        "address": address,
    }


def module_page_context(module, request=None):
    module = normalize_module(module)
    meta = REGISTRAR_MODULES[module]
    ctx = {
        "module": module,
        "active_menu": meta["label"],
        "page_title": meta.get("title", meta["label"]),
        "page_subtitle": meta.get("subtitle", ""),
        "sidebar_menu": registrar_sidebar(),
        "logout_class": "text-red-600 hover:bg-red-50",
    }
    if module == "egace-table":
        from backend.trainer.egace_records import TRAINER_STUDENT_PROGRESS

        ctx["trainer_egace_seed_json"] = json.dumps(TRAINER_STUDENT_PROGRESS)
    if module == "settings":
        user = getattr(request, "user", None) if request else None
        profile = settings_profile_defaults(user)
        ctx["settings_profile"] = profile
        ctx["settings_address_json"] = json.dumps(profile.get("address", {}))
    if module in ("enrollment", "batching-scheduling"):
        from backend.student.enrollment_workflow import ENROLLMENT_PIPELINE

        ctx["enrollment_pipeline_json"] = json.dumps(list(ENROLLMENT_PIPELINE))
    if module == "batching-scheduling":
        from .batching_api import batching_courses_payload, batching_templates_payload

        ctx["batching_trainers"] = batching_trainers_payload()
        ctx["batching_courses"] = batching_courses_payload()
        ctx["batching_templates"] = batching_templates_payload()
    if module == "enrollment":
        from .pending_enrollment import pending_enrollment_count, pending_enrollments_payload

        # Pass a Python list — json_script in the template encodes it once.
        ctx["pending_enrollments"] = pending_enrollments_payload()
        ctx["pending_enrollment_count"] = pending_enrollment_count()
    if module == "trainer-approval":
        from .trainer_approval import (
            pending_trainer_requests_count,
            pending_trainer_requests_payload,
        )

        ctx["trainer_approval_items"] = pending_trainer_requests_payload()
        ctx["trainer_approval_count"] = pending_trainer_requests_count()
    if module == "student":
        from .student_list import registrar_students_module_data

        ctx["registrar_students_data"] = registrar_students_module_data()
    if module == "dashboard":
        from .dashboard_stats import registrar_dashboard_stats

        ctx["registrar_dashboard_stats"] = registrar_dashboard_stats()
    return ctx


def module_template(module):
    module = normalize_module(module)
    return REGISTRAR_MODULES[module].get("template", "registrar/page.html")
