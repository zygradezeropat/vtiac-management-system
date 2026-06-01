"""Staff portal settings API (profile + password) — all staff roles."""

import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from backend.accounts.services import STAFF_ROLES
from backend.core.staff_settings import (
    change_staff_password,
    parse_profile_post,
    staff_settings_profile,
    update_staff_profile,
    validate_password_change,
    validate_profile_data,
)


def _access_denied_response(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False, "message": "Please sign in."}, status=401)
    role = (request.session.get("portal_role") or "").lower()
    if role not in STAFF_ROLES:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)
    return None


def _profile_json_response(profile):
    display_name = f"{profile['first_name']} {profile['last_name']}".strip()
    parts = display_name.split()
    initials = (
        f"{parts[0][0]}{parts[-1][0]}".upper()
        if len(parts) >= 2
        else (display_name[:2].upper() if display_name else "")
    )
    return JsonResponse(
        {
            "ok": True,
            "message": "Profile updated successfully.",
            "display_name": display_name,
            "initials": initials,
            "profile": profile,
        }
    )


@login_required(login_url="/")
@require_POST
def settings_profile_api(request):
    denied = _access_denied_response(request)
    if denied:
        return denied

    data = parse_profile_post(request.POST)
    errors = validate_profile_data(data, request.user)
    if errors:
        return JsonResponse({"ok": False, "message": errors[0], "errors": errors}, status=400)

    try:
        profile = update_staff_profile(request.user, data)
    except Exception as exc:
        return JsonResponse(
            {"ok": False, "message": f"Could not save profile: {exc}"},
            status=500,
        )

    return _profile_json_response(profile)


@login_required(login_url="/")
@require_POST
def settings_password_api(request):
    denied = _access_denied_response(request)
    if denied:
        return denied

    current = request.POST.get("currentPassword", "")
    new_password = request.POST.get("newPassword", "")
    confirm = request.POST.get("confirmPassword", "")

    errors = validate_password_change(request.user, current, new_password, confirm)
    if errors:
        return JsonResponse({"ok": False, "message": errors[0], "errors": errors}, status=400)

    try:
        change_staff_password(request.user, new_password)
    except Exception as exc:
        return JsonResponse(
            {"ok": False, "message": f"Could not update password: {exc}"},
            status=500,
        )

    return JsonResponse({"ok": True, "message": "Password updated successfully."})


def staff_settings_page_context(user):
    profile = staff_settings_profile(user)
    return {
        "settings_profile": profile,
        "settings_address_json": json.dumps(profile.get("address", {})),
    }
