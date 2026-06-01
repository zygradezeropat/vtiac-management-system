"""Student portal — settings page context."""

import json

from .services import _student_portal_base, get_enrollment_profile


def settings_profile_defaults(user):
    """Profile fields for the settings form (registration / enrollment / user)."""
    address = {
        "region": "",
        "province": "",
        "cityMunicipality": "",
        "barangay": "",
        "streetHouse": "",
    }
    first_name = ""
    last_name = ""
    email = ""
    phone = ""

    if user and user.is_authenticated:
        first_name = user.first_name or ""
        last_name = user.last_name or ""
        email = user.email or ""

    reg = getattr(user, "registration_application", None) if user else None
    if reg:
        first_name = first_name or reg.first_name
        last_name = last_name or reg.last_name
        email = email or reg.email
        phone = reg.phone_number or phone
        address = {
            "region": reg.region_code or "",
            "province": reg.province_code or "",
            "cityMunicipality": reg.city_code or "",
            "barangay": reg.barangay_code or "",
            "streetHouse": reg.street_house or "",
        }

    profile = get_enrollment_profile(user) if user else None
    if profile:
        first_name = first_name or profile.first_name
        last_name = last_name or profile.last_name
        email = email or profile.email
        phone = phone or profile.contact_number
        if not address.get("region"):
            address = {
                "region": profile.region_code or "",
                "province": profile.province_code or "",
                "cityMunicipality": profile.city_code or "",
                "barangay": profile.barangay_code or "",
                "streetHouse": address.get("streetHouse", ""),
            }

    return {
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "phone": phone,
        "address": address,
    }


def student_settings_context(request):
    profile = settings_profile_defaults(request.user)
    return _student_portal_base(
        request,
        active_menu="Settings",
        page_title="Settings",
        page_subtitle="Manage your profile and account security",
        settings_profile=profile,
        settings_address_json=json.dumps(profile.get("address", {})),
    )
