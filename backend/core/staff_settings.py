"""Shared staff portal settings — profile and password updates."""

import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from .models import StaffAccountProfile

User = get_user_model()

PH_MOBILE_RE = re.compile(r"^09\d{9}$")
PHONE_MSG = "Enter 11 digits including 09 (example: 09171234567)."


def _empty_address():
    return {
        "region": "",
        "province": "",
        "cityMunicipality": "",
        "barangay": "",
        "streetHouse": "",
    }


def get_or_create_account_profile(user):
    profile, _ = StaffAccountProfile.objects.get_or_create(user=user)
    return profile


def staff_settings_profile(user):
    """Profile dict for settings forms (User + StaffAccountProfile)."""
    address = _empty_address()
    first_name = ""
    last_name = ""
    email = ""
    phone = ""

    if user and user.is_authenticated:
        first_name = user.first_name or ""
        last_name = user.last_name or ""
        email = user.email or ""
        account = getattr(user, "staff_account_profile", None)
        if account:
            phone = account.phone_number or ""
            address = {
                "region": account.region_code or "",
                "province": account.province_code or "",
                "cityMunicipality": account.city_code or "",
                "barangay": account.barangay_code or "",
                "streetHouse": account.street_house or "",
            }

    return {
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "phone": phone,
        "address": address,
    }


def _normalize_phone(value):
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("63"):
        return "0" + digits[2:]
    if len(digits) == 10 and digits.startswith("9"):
        return "0" + digits
    return digits or (value or "").strip()


def parse_profile_post(post):
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


def validate_profile_data(data, user):
    errors = []
    if not data.get("first_name"):
        errors.append("First name is required.")
    if not data.get("last_name"):
        errors.append("Last name is required.")
    if not data.get("email"):
        errors.append("Email address is required.")
    elif User.objects.filter(email__iexact=data["email"]).exclude(pk=user.pk).exists():
        errors.append("Another account already uses this email address.")

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


def update_staff_profile(user, data):
    user.first_name = data["first_name"]
    user.last_name = data["last_name"]
    user.email = data["email"]
    user.save(update_fields=["first_name", "last_name", "email"])

    account = get_or_create_account_profile(user)
    account.phone_number = data["phone"]
    account.region_code = data["region"]
    account.province_code = data["province"]
    account.city_code = data["city"]
    account.barangay_code = data["barangay"]
    account.street_house = data["street_house"]
    account.save()

    return staff_settings_profile(user)


def validate_password_change(user, current_password, new_password, confirm_password):
    errors = []
    if not current_password:
        errors.append("Current password is required.")
    elif not user.check_password(current_password):
        errors.append("Current password is incorrect.")

    if not new_password:
        errors.append("New password is required.")
    elif len(new_password) < 8:
        errors.append("New password must be at least 8 characters.")
    else:
        try:
            validate_password(new_password, user=user)
        except ValidationError as exc:
            errors.extend(exc.messages)

    if not confirm_password:
        errors.append("Password confirmation is required.")
    elif new_password != confirm_password:
        errors.append("New password and confirmation do not match.")

    return errors


def change_staff_password(user, new_password):
    user.set_password(new_password)
    user.save(update_fields=["password"])
