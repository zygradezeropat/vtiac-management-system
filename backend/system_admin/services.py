"""System admin portal page context (plain Django)."""

ADMIN_ROLE = "admin"

ADMIN_MODULE_ORDER = (
    "dashboard",
    "system-settings",
    "user-management",
    "training-approval",
    "settings",
)

ADMIN_MODULES = {
    "dashboard": {
        "label": "Dashboard",
        "icon_bi": "bi-house-door-fill",
        "title": "Dashboard",
        "subtitle": "",
        "template": "admin/dashboard.html",
        "route": "/dashboard/admin/",
        "sidebar": True,
    },
    "system-settings": {
        "label": "System Settings",
        "icon_bi": "bi-sliders",
        "title": "System Settings",
        "subtitle": "Manage NC programs, fees, fiscal year, and enrollment",
        "template": "admin/system_settings.html",
        "sidebar": True,
    },
    "user-management": {
        "label": "User Management",
        "icon_bi": "bi-people-fill",
        "title": "User Management",
        "subtitle": "Create and manage staff and student portal accounts",
        "template": "admin/user_management.html",
        "sidebar": True,
    },
    "training-approval": {
        "label": "Training Approval",
        "icon_bi": "bi-person-check-fill",
        "title": "Training Approval",
        "subtitle": "Review and approve training-related requests",
        "template": "admin/training_approval.html",
        "sidebar": True,
    },
    "settings": {
        "label": "Settings",
        "icon_bi": "bi-gear-fill",
        "title": "Settings",
        "subtitle": "Manage your preferences and account settings",
        "template": "admin/settings.html",
        "sidebar": True,
    },
}

MODULE_ALIASES = {}

ALLOWED_MODULES = frozenset(ADMIN_MODULES.keys())


def get_fiscal_year_label():
    from .program_config import fiscal_year_label

    return fiscal_year_label()


def admin_route(slug):
    meta = ADMIN_MODULES[slug]
    return meta.get("route", f"/admin/{slug}/")


def admin_sidebar():
    menu = []
    for slug in ADMIN_MODULE_ORDER:
        meta = ADMIN_MODULES[slug]
        if meta.get("sidebar", True) is False:
            continue
        menu.append(
            {
                "label": meta["label"],
                "route": admin_route(slug),
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


def module_page_context(module, request=None):
    module = normalize_module(module)
    meta = ADMIN_MODULES[module]
    ctx = {
        "module": module,
        "active_menu": meta["label"],
        "page_title": meta.get("title", meta["label"]),
        "page_subtitle": meta.get("subtitle", ""),
        "sidebar_menu": admin_sidebar(),
        "fiscal_year_label": get_fiscal_year_label(),
        "portal_role_label": "Administrator",
    }
    if module == "settings":
        from backend.core.staff_settings_views import staff_settings_page_context

        user = getattr(request, "user", None) if request else None
        ctx.update(staff_settings_page_context(user))
    if module == "training-approval":
        from backend.trainer.approval import (
            pending_trainer_requests_count,
            pending_trainer_requests_payload,
        )

        ctx["trainer_approval_items"] = pending_trainer_requests_payload()
        ctx["trainer_approval_count"] = pending_trainer_requests_count()
    if module == "dashboard":
        from .dashboard_stats import admin_dashboard_stats

        ctx["admin_dashboard_stats"] = admin_dashboard_stats()
    return ctx


def module_template(module):
    module = normalize_module(module)
    return ADMIN_MODULES[module].get("template", "admin/page.html")
