"""Portal access for trainer approval (admin and registrar)."""

from django.contrib import messages
from django.shortcuts import redirect

from backend.accounts.services import PORTAL_ROLES, redirect_to_dashboard
from backend.core.models import StaffProfile

TRAINER_APPROVAL_PORTAL_ROLES = frozenset(
    {
        StaffProfile.Role.ADMIN,
        StaffProfile.Role.REGISTRAR,
    }
)


def require_trainer_approval_access(request):
    """Return redirect if user cannot approve trainer accounts, else None."""
    if not request.user.is_authenticated:
        messages.error(request, "Please sign in to continue.")
        return redirect("login", role=StaffProfile.Role.REGISTRAR)

    session_role = (request.session.get("portal_role") or "").lower()
    if session_role not in TRAINER_APPROVAL_PORTAL_ROLES:
        if session_role in PORTAL_ROLES:
            return redirect_to_dashboard(session_role)
        return redirect("login", role=StaffProfile.Role.REGISTRAR)

    try:
        profile = request.user.staff_profile
    except StaffProfile.DoesNotExist:
        messages.error(request, "This account is not set up for staff portal access.")
        return redirect("login", role=session_role)

    if profile.role != session_role:
        messages.error(
            request,
            f"This account is registered as {profile.get_role_display()}, not {session_role}.",
        )
        return redirect("login", role=session_role)

    return None
