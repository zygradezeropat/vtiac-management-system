from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render

from .services import (
    handle_portal_login_post,
    handle_portal_logout,
    login_page_context,
    redirect_to_dashboard,
)


def login_page(request, role):
    if request.method == "POST":
        return handle_portal_login_post(request, role)
    return render(request, "auth/login.html", login_page_context(role))


def portal_logout(request):
    return handle_portal_logout(request)


@login_required
def switch_portal(request, role):
    role = (role or "").lower()
    if not hasattr(request.user, "staff_profile"):
        messages.error(request, "Only staff accounts can switch portals.")
        return redirect("landing")

    profile = request.user.staff_profile
    if role not in profile.get_allowed_roles():
        messages.error(request, f"You do not have permission to access the {role.title()} portal.")
        return redirect_to_dashboard(profile.role, user=request.user)

    request.session["portal_role"] = role
    messages.success(request, f"Switched to {role.title()} portal.")
    return redirect_to_dashboard(role, user=request.user)
