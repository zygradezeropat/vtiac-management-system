"""Cashier portal page context (plain Django)."""

CASHIER_ROLE = "cashier"

CASHIER_MODULE_ORDER = (
    "dashboard",
    "students",
    "history",
    "reports",
    "settings",
)

CASHIER_MODULES = {
    "dashboard": {
        "label": "Dashboard",
        "icon_bi": "bi-house-door-fill",
        "title": "Cashier Dashboard",
        "subtitle": "Manage student payments and generate receipts",
        "template": "cashier/dashboard.html",
        "route": "/dashboard/cashier/",
        "sidebar": True,
    },
    "students": {
        "label": "Students",
        "icon_bi": "bi-people-fill",
        "title": "Student Accounts",
        "subtitle": "View student payment information",
        "template": "cashier/students.html",
        "sidebar": True,
    },
    "payment": {
        "label": "Process Payment",
        "icon_bi": "bi-credit-card-fill",
        "title": "Process Payment",
        "subtitle": "Create new payment document",
        "template": "cashier/payment.html",
        "sidebar": False,
    },
    "history": {
        "label": "History",
        "icon_bi": "bi-clock-history",
        "title": "Transaction History",
        "subtitle": "View all payment transactions",
        "template": "cashier/history.html",
        "sidebar": True,
    },
    "reports": {
        "label": "Reports",
        "icon_bi": "bi-bar-chart-fill",
        "title": "Collection Reports",
        "subtitle": "Generate and view payment collection reports",
        "template": "cashier/reports.html",
        "sidebar": True,
    },
    "settings": {
        "label": "Settings",
        "icon_bi": "bi-gear-fill",
        "title": "Settings",
        "subtitle": "Manage your account settings",
        "template": "cashier/settings.html",
        "sidebar": True,
    },
}

MODULE_ALIASES = {
    "student": "students",
}

ALLOWED_MODULES = frozenset(CASHIER_MODULES.keys())


def cashier_route(slug):
    meta = CASHIER_MODULES[slug]
    return meta.get("route", f"/cashier/{slug}/")


def cashier_sidebar():
    menu = []
    for slug in CASHIER_MODULE_ORDER:
        meta = CASHIER_MODULES[slug]
        if meta.get("sidebar", True) is False:
            continue
        menu.append(
            {
                "label": meta["label"],
                "route": cashier_route(slug),
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


def module_page_context(module):
    module = normalize_module(module)
    meta = CASHIER_MODULES[module]
    return {
        "module": module,
        "active_menu": meta["label"],
        "page_title": meta.get("title", meta["label"]),
        "page_subtitle": meta.get("subtitle", ""),
        "sidebar_menu": cashier_sidebar(),
        "logout_class": "text-gray-600 hover:bg-gray-200/60",
    }


def module_template(module):
    module = normalize_module(module)
    return CASHIER_MODULES[module].get("template", "cashier/page.html")
