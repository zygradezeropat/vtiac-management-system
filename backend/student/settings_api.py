"""Student portal settings — profile and password API."""

import re

from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from backend.accounts.services import STUDENT_ROLE, require_portal_access
from backend.core.staff_settings import change_staff_password, validate_password_change

from .models import StudentEnrollmentProfile, StudentRegistration
from .student_settings import settings_profile_defaults

User = get_user_model()

PH_MOBILE_RE = re.compile(r"^09\d{9}$")
PHONE_MSG = "Enter 11 digits including 09 (example: 09171234567)."


def _normalize_phone(value):
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("63"):
        return "0" + digits[2:]
    if len(digits) == 10 and digits.startswith("9"):
        return "0" + digits
    return digits or (value or "").strip()


def parse_student_profile_post(post):
    return {
        "first_name": post.get("firstName", "").strip(),
        "last_name": post.get("lastName", "").strip(),
        "email": post.get("email", "").strip().lower(),
        "phone": _normalize_phone(post.get("phone", "").strip()),
        "region": post.get("region", "").strip(),
        "province": post.get("province", "").strip(),
        "city": post.get("cityMunicipality", "").strip(),
        "barangay": post.get("barangay", "").strip(),
        "street_house": post.get("streetHouse", "").strip(),
    }


def validate_student_profile_data(data, user):
    errors = []
    if not data.get("first_name"):
        errors.append("First name is required.")
    if not data.get("last_name"):
        errors.append("Last name is required.")
    if not data.get("email"):
        errors.append("Email address is required.")
    else:
        email = data["email"]
        if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            errors.append("Another account already uses this email address.")
        if (
            StudentRegistration.objects.filter(email__iexact=email)
            .exclude(user_id=user.pk)
            .exists()
        ):
            errors.append("Another registration already uses this email address.")

    phone = data.get("phone", "")
    if not phone:
        errors.append("Contact number is required.")
    elif not PH_MOBILE_RE.match(phone):
        errors.append(PHONE_MSG)

    for field, label in (
        ("region", "Region"),
        ("province", "Province"),
        ("city", "City/Municipality"),
        ("barangay", "Barangay"),
    ):
        if not data.get(field):
            errors.append(f"{label} is required.")

    return errors


@transaction.atomic
def update_student_profile(user, data):
    user.first_name = data["first_name"]
    user.last_name = data["last_name"]
    user.email = data["email"]
    user.save(update_fields=["first_name", "last_name", "email"])

    reg = getattr(user, "registration_application", None)
    if reg:
        reg.first_name = data["first_name"]
        reg.last_name = data["last_name"]
        reg.email = data["email"]
        reg.phone_number = data["phone"]
        reg.region_code = data["region"]
        reg.province_code = data["province"]
        reg.city_code = data["city"]
        reg.barangay_code = data["barangay"]
        reg.street_house = data["street_house"]
        reg.save(
            update_fields=[
                "first_name",
                "last_name",
                "email",
                "phone_number",
                "region_code",
                "province_code",
                "city_code",
                "barangay_code",
                "street_house",
            ]
        )

    profile = StudentEnrollmentProfile.objects.filter(user_id=user.pk).first()
    if profile:
        profile.first_name = data["first_name"]
        profile.last_name = data["last_name"]
        profile.email = data["email"]
        profile.contact_number = data["phone"]
        profile.region_code = data["region"]
        profile.province_code = data["province"]
        profile.city_code = data["city"]
        profile.barangay_code = data["barangay"]
        profile.street_house = data["street_house"]
        profile.save(
            update_fields=[
                "first_name",
                "last_name",
                "email",
                "contact_number",
                "region_code",
                "province_code",
                "city_code",
                "barangay_code",
                "street_house",
            ]
        )

    return settings_profile_defaults(user)


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
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    data = parse_student_profile_post(request.POST)
    errors = validate_student_profile_data(data, request.user)
    if errors:
        return JsonResponse({"ok": False, "message": errors[0], "errors": errors}, status=400)

    try:
        profile = update_student_profile(request.user, data)
    except Exception as exc:
        return JsonResponse(
            {"ok": False, "message": f"Could not save profile: {exc}"},
            status=500,
        )

    return _profile_json_response(profile)


@login_required(login_url="/")
@require_POST
def settings_password_api(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

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
