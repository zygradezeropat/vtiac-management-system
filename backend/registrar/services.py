"""Registrar portal page context (plain Django)."""

import json

REGISTRAR_ROLE = "registrar"

# Order preserved for sidebar display
REGISTRAR_MODULE_ORDER = (
    "dashboard",
    "student",
    "enrollment",
    "document-requests",
    "batching-scheduling",
    "finalized-batches",
    "scholarship",
    "egace-table",
    "trainer-evaluations",
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
    "document-requests": {
        "label": "Document Requests",
        "icon_bi": "bi-file-earmark-text-fill",
        "badge_class": "registrar-badge-danger",
        "title": "Document Requests",
        "subtitle": "View, process, and approve official document requests submitted by students",
        "template": "registrar/document_requests.html",
    },

    "batching-scheduling": {
        "label": "Batching & Scheduling",
        "icon_bi": "bi-calendar-week",
        "title": "Batching & Scheduling Management",
        "subtitle": "Institutional training schedules and national competency (EGACE) assessment batches",
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
    "egace-table": {
        "label": "E.G.A.C.E Table",
        "icon_bi": "bi-table",
        "title": "E.G.A.C.E Table",
        "subtitle": "Enrolled · Graduate · Assessment · Certificate · Employment tracking",
        "template": "registrar/egace_table.html",
    },
    "trainer-evaluations": {
        "label": "Trainer Evaluations",
        "icon_bi": "bi-person-check-fill",
        "title": "Trainer Evaluations",
        "subtitle": "View trainer evaluations",
        "template": "registrar/trainer_evaluation_reports.html",
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


def pending_document_requests_count():
    try:
        from backend.student.models import StudentDocumentRequest

        return StudentDocumentRequest.objects.filter(
            status=StudentDocumentRequest.Status.PENDING
        ).count()
    except Exception:
        return 0


def registrar_sidebar():
    from .pending_enrollment import pending_enrollment_count

    pending_count = pending_enrollment_count()
    doc_pending_count = pending_document_requests_count()
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
        elif slug == "document-requests" and doc_pending_count:
            badge = str(doc_pending_count)
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
    """Profile fields for the settings form (User + StaffAccountProfile)."""
    from backend.core.staff_settings import staff_settings_profile

    return staff_settings_profile(user)


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
    if module == "document-requests":
        from backend.student.models import StudentDocumentRequest

        requests_qs = StudentDocumentRequest.objects.select_related("user", "profile").order_by("-requested_at")
        req_list = []
        for r in requests_qs:
            student_name = r.user.get_full_name() or r.user.email
            if r.profile:
                parts = [p for p in [r.profile.last_name, r.profile.first_name] if p]
                if parts:
                    student_name = ", ".join(parts)
            program_name = r.profile.selected_program if r.profile else "N/A"

            req_list.append({
                "id": r.id,
                "student_name": student_name,
                "student_email": r.user.email,
                "program_name": program_name,
                "document_name": r.document_name,
                "purpose": r.purpose or "Personal Record",
                "status": r.status,
                "status_display": r.get_status_display(),
                "remarks": r.remarks or "",
                "requested_at": r.requested_at.strftime("%B %d, %Y %I:%M %p"),
            })
        ctx["document_requests"] = req_list
        ctx["total_requests"] = len(req_list)
        ctx["pending_requests"] = sum(1 for x in req_list if x["status"] == "pending")
        ctx["processing_requests"] = sum(1 for x in req_list if x["status"] == "processing")
        ctx["ready_requests"] = sum(1 for x in req_list if x["status"] in ("ready", "completed"))
        ctx["document_requests_json"] = json.dumps(req_list)

    if module == "egace-table":
        from django.urls import reverse

        from backend.trainer.egace_records import egace_rows_for_registrar

        ctx["trainer_egace_seed_json"] = json.dumps(egace_rows_for_registrar())
        ctx["egace_config_json"] = json.dumps(
            {
                "employment_url": reverse("registrar_egace_set_employment"),
            }
        )
    if module == "scholarship":
        from .scholarship_registry import (
            scholarship_enrolled_scholars,
            scholarship_student_registry,
        )

        ctx["scholarship_registry_json"] = json.dumps(scholarship_student_registry())
        ctx["scholarship_scholars_json"] = json.dumps(scholarship_enrolled_scholars())
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
        from .pending_enrollment import pending_enrollments_payload

        ctx["batching_trainers"] = batching_trainers_payload()
        ctx["batching_courses"] = batching_courses_payload()
        ctx["batching_templates"] = batching_templates_payload()
        ctx["pending_enrollments"] = pending_enrollments_payload()
    if module == "enrollment":
        from .pending_enrollment import pending_enrollment_count, pending_enrollments_payload

        # Pass a Python list — json_script in the template encodes it once.
        ctx["pending_enrollments"] = pending_enrollments_payload()
        ctx["pending_enrollment_count"] = pending_enrollment_count()
    if module == "student":
        from .student_list import registrar_students_module_data

        ctx["registrar_students_data"] = registrar_students_module_data()
    if module == "dashboard":
        from .dashboard_stats import registrar_dashboard_stats

        year = ""
        start = ""
        end = ""
        if request is not None:
            year = (request.GET.get("year") or "").strip()
            start = (request.GET.get("start_date") or "").strip()
            end = (request.GET.get("end_date") or "").strip()
        stats = registrar_dashboard_stats(
            year=year or None,
            start_date=start or None,
            end_date=end or None,
        )
        ctx["registrar_dashboard_stats"] = stats
        ctx["dashboard_filter_start"] = stats.get("filterStart") or start
        ctx["dashboard_filter_end"] = stats.get("filterEnd") or end
    return ctx


def module_template(module):
    module = normalize_module(module)
    return REGISTRAR_MODULES[module].get("template", "registrar/page.html")
