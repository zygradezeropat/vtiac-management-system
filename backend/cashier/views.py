from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render

from backend.accounts.services import require_portal_access

from .services import (
    CASHIER_ROLE,
    module_page_context,
    module_template,
    normalize_module,
)


@login_required(login_url="/")
def dashboard(request):
    return module_page(request, "dashboard")


@login_required(login_url="/")
def module_page(request, module):
    denied = require_portal_access(request, CASHIER_ROLE)
    if denied:
        return denied

    module = normalize_module(module)
    return render(
        request,
        module_template(module),
        module_page_context(module, request),
    )
