"""Student registration helpers (plain Django — no DRF)."""

import math
import re

from django.contrib.auth import get_user_model
from django.db import transaction

from backend.student.enrollment_requirements import (
    dashboard_requirements_from_profile,
    enrollment_progress_percent,
)
from backend.student.enrollment_workflow import (
    application_status_label,
    build_enrollment_steps_timeline,
)
from backend.student.schedule_assignment import dashboard_schedule_context
from backend.student.assessment_enrollment import (
    ASSESSMENT_CLIENT_TYPES,
    ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
    ASSESSMENT_DEFAULT_SCHOOL_NAME,
    ASSESSMENT_TYPE_OPTIONS,
    TESDA_ASSESSMENT_EDUCATION_CHOICES,
    TESDA_ASSESSMENT_EMPLOYMENT_CHOICES,
    assessment_form_initial_extra,
    build_assessment_application_payload,
    merge_assessment_application_data,
    validate_assessment_enrollment_data,
)
from backend.student.models import (
    StudentEnrollmentProfile,
    StudentProfile,
    StudentRegistration,
)

User = get_user_model()

PH_MOBILE_RE = re.compile(r"^09\d{9}$")
PHONE_MSG = "Enter 11 digits including 09 (example: 09171234567)."

STUDENT_ROLE = "student"

STUDENT_SIDEBAR = (
    {"label": "Dashboard", "icon_bi": "bi-house", "route_name": "student_dashboard"},
    {"label": "Enrollment", "icon_bi": "bi-journal-bookmark", "route_name": "student_enrollment"},
    {"label": "Payments", "icon_bi": "bi-credit-card", "route_name": "student_payments"},
    {"label": "Documents", "icon_bi": "bi-file-earmark-text", "route_name": "student_documents"},
    {"label": "Settings", "icon_bi": "bi-gear", "route_name": "student_settings"},
)

NAME_EXTENSIONS = ("", "Jr.", "Sr.", "II", "III", "IV", "V")

EMPLOYMENT_STATUS_CHOICES = (
    ("wage_employed", "Wage-Employed"),
    ("underemployed", "Underemployed"),
    ("self_employed", "Self-Employed"),
    ("unemployed", "Unemployed"),
)

EMPLOYMENT_TYPE_CHOICES = (
    ("", "Select employment type"),
    ("none", "None"),
    ("casual", "Casual"),
    ("probationary", "Probationary"),
    ("contractual", "Contractual"),
    ("regular", "Regular"),
    ("job_order", "Job Order"),
    ("permanent", "Permanent"),
    ("temporary", "Temporary"),
)

EDUCATIONAL_ATTAINMENT_CHOICES = (
    ("no_grade", "No Grade Completed"),
    ("elementary_undergrad", "Elementary Undergraduate"),
    ("elementary_graduate", "Elementary Graduate"),
    ("high_school_undergrad", "High School Undergraduate"),
    ("high_school_graduate", "High School Graduate"),
    ("junior_high", "Junior High (K-12)"),
    ("senior_high", "Senior High (K-12)"),
    ("post_secondary_undergrad", "Post-Secondary Non-Tertiary / TVET Undergraduate"),
    ("post_secondary_graduate", "Post-Secondary Non-Tertiary / TVET Graduate"),
    ("college_undergraduate", "College Undergraduate"),
    ("college_graduate", "College Graduate"),
    ("masteral", "Masteral"),
    ("doctorate", "Doctorate"),
)

SCHOLARSHIP_TYPE_CHOICES = (
    ("", "Select scholarship type"),
    ("tesda", "TESDA Scholarship"),
    ("twsp", "TWSP"),
    ("pesa", "PESFA"),
    ("uaqtea", "UAQTEA"),
    ("others", "Others"),
)

DISABILITY_TYPES = (
    "Mental / Intellectual",
    "Hearing Disability",
    "Psychosocial Disability",
    "Visual Disability",
    "Speech Impairment",
    "Disability Due to Chronic Illness",
    "Orthopedic Disability",
    "Multiple Disabilities",
    "Learning Disability",
)

DISABILITY_CAUSES = (
    "Congenital / Inborn",
    "Illness",
    "Injury",
)

from backend.system_admin.program_config import enrollment_is_open, enrollment_program_options

CLIENT_CLASSIFICATIONS = (
    "4Ps Beneficiary",
    "Industry Workers",
    "TESDA Alumni",
    "Drug Dependents Surrenderees / Surrenderers",
    "Overseas Filipino Workers (OFW) Dependent",
    "Wounded in Action AFP & PNP Personnel",
    "Indigenous People & Cultural Communities",
    "Student",
    "Displaced Workers",
    "Out of School Youth",
    "Victim of Natural Disasters and Calamities",
    "Farmers and Fishermen",
    "Returning / Repatriated OFWs",
    "Balik Probinsya",
    "MILF Beneficiary",
    "Uniformed Personnel",
    "Family Members of AFP and PNP Wounded in Action",
    "Rebel Returnees / Decommissioned Combatants",
    "Agrarian Reform Beneficiary",
    "Inmates and Detainees",
    "TVET Trainers",
    "Family Members of AFP and PNP Killed in Action",
    "RCEF-RESP",
    "Others",
)


def get_enrollment_profile(user):
    """Return enrollment profile or None (safe when table is missing or no row)."""
    if not getattr(user, "is_authenticated", False) or not user.is_authenticated:
        return None
    try:
        return StudentEnrollmentProfile.objects.filter(user_id=user.pk).first()
    except Exception:
        return None


def _student_sidebar_menu(user=None):
    from django.urls import reverse

    hide_enrollment = (
        user is not None
        and getattr(user, "is_authenticated", False)
        and registration_is_enrolled(user)
    )

    menu = []
    for item in STUDENT_SIDEBAR:
        if hide_enrollment and item.get("route_name") == "student_enrollment":
            continue
        route = reverse(item["route_name"]) if item["route_name"] else "#"
        menu.append({**item, "route": route})
    return menu


def _registration_snapshot(user):
    """Build dashboard fields from the student's registration record when available."""
    reg = getattr(user, "registration_application", None)
    if reg is None:
        return {
            "application_status": "In Progress",
            "progress_percent": 25,
            "program_name": "Automotive Servicing NC I",
            "program_type_label": "Training with Assessment",
        }

    status_labels = {
        StudentRegistration.Status.PENDING: "In Progress",
        StudentRegistration.Status.APPROVED: "Enrolled",
        StudentRegistration.Status.REJECTED: "Rejected",
    }
    progress_map = {
        StudentRegistration.Status.PENDING: 25,
        StudentRegistration.Status.APPROVED: 75,
        StudentRegistration.Status.REJECTED: 10,
    }
    program_type_labels = dict(StudentRegistration.ProgramType.choices)

    profile = get_enrollment_profile(user)
    progress = enrollment_progress_percent(profile) if profile else progress_map.get(reg.status, 25)

    return {
        "application_status": status_labels.get(reg.status, "In Progress"),
        "progress_percent": progress,
        "program_name": reg.selected_program,
        "program_type_label": program_type_labels.get(reg.program_type, reg.program_type),
    }


def _student_portal_base(request, active_menu, page_title, page_subtitle, **extra):
    user = request.user if request and request.user.is_authenticated else None
    snapshot = _registration_snapshot(user) if user else {}
    progress_percent = snapshot.get("progress_percent", 25)
    return {
        "page_title": page_title,
        "page_subtitle": page_subtitle,
        "active_menu": active_menu,
        "sidebar_menu": _student_sidebar_menu(user),
        "notification_count": 0,
        "progress_percent": progress_percent,
        **snapshot,
        **extra,
    }


def _enrollment_form_initial_from_registration(reg):
    program_type_labels = dict(StudentRegistration.ProgramType.choices)
    return {
        "last_name": reg.last_name,
        "first_name": reg.first_name,
        "middle_name": reg.middle_name,
        "email": reg.email,
        "contact_number": reg.phone_number,
        "region_code": reg.region_code,
        "province_code": reg.province_code,
        "city_code": reg.city_code,
        "barangay_code": reg.barangay_code,
        "street_house": reg.street_house,
        "district": "",
        "birth_date": reg.birth_date.isoformat() if reg.birth_date else "",
        "sex": reg.gender,
        "civil_status": reg.civil_status,
        "educational_attainment": reg.educational_attainment,
        "parent_guardian_name": reg.emergency_name,
        "parent_guardian_address": "",
        "program_name": reg.selected_program,
        "program_type": reg.program_type,
        "program_type_label": program_type_labels.get(reg.program_type, reg.program_type),
        "reference_id": reg.reference_id,
        "uli": "",
        "name_extension": "",
        "nationality": "Filipino",
        "employment_status": "",
        "employment_type": "",
        "birthplace": "",
        "scholarship_type": "",
        "privacy_consent": False,
        "signature": "",
        "date_accomplished": "",
        "noted_by": "",
        "date_received": "",
        "selected_classifications": [],
        "selected_disability_types": [],
        "selected_disability_causes": [],
        "disability_other_specify": "",
        "has_existing_photo": False,
        "existing_photo_name": "",
        "existing_photo_url": "",
    }


def _enrollment_form_initial_from_profile(profile):
    program_type_labels = dict(StudentRegistration.ProgramType.choices)
    return {
        "last_name": profile.last_name,
        "first_name": profile.first_name,
        "middle_name": profile.middle_name,
        "email": profile.email,
        "contact_number": profile.contact_number,
        "region_code": profile.region_code,
        "province_code": profile.province_code,
        "city_code": profile.city_code,
        "barangay_code": profile.barangay_code,
        "street_house": profile.street_house,
        "district": profile.district,
        "birth_date": profile.birth_date.isoformat() if profile.birth_date else "",
        "sex": profile.sex,
        "civil_status": profile.civil_status,
        "educational_attainment": profile.educational_attainment,
        "parent_guardian_name": profile.parent_guardian_name,
        "parent_guardian_address": profile.parent_guardian_address,
        "program_name": profile.selected_program,
        "program_type": profile.program_type,
        "program_type_label": program_type_labels.get(profile.program_type, profile.program_type),
        "reference_id": profile.tsmis,
        "uli": profile.uli,
        "name_extension": profile.name_extension,
        "nationality": profile.nationality,
        "employment_status": profile.employment_status,
        "employment_type": profile.employment_type,
        "birthplace": profile.birthplace,
        "scholarship_type": profile.scholarship_type,
        "privacy_consent": profile.privacy_consent,
        "signature": profile.signature,
        "date_accomplished": (
            profile.date_accomplished.isoformat() if profile.date_accomplished else ""
        ),
        "noted_by": profile.noted_by,
        "date_received": profile.date_received.isoformat() if profile.date_received else "",
        "selected_classifications": list(profile.client_classifications or []),
        "selected_disability_types": list(profile.disability_types or []),
        "selected_disability_causes": list(profile.disability_causes or []),
        "disability_other_specify": profile.disability_other_specify,
        "has_existing_photo": bool(profile.photo),
        "existing_photo_name": profile.photo.name.split("/")[-1] if profile.photo else "",
        "existing_photo_url": profile.photo.url if profile.photo else "",
        **assessment_form_initial_extra(profile, profile.registration),
    }


def _enrollment_form_initial(user):
    """Pre-fill from saved enrollment profile, else registration application."""
    profile = get_enrollment_profile(user)
    if profile is not None:
        return _enrollment_form_initial_from_profile(profile)

    reg = getattr(user, "registration_application", None)
    if reg is None:
        initial = {
            "selected_classifications": [],
            "selected_disability_types": [],
            "selected_disability_causes": [],
            "disability_other_specify": "",
            "has_existing_photo": False,
        }
        if is_assessment_only_program(enrollment_program_type_for_user(user)):
            initial.update(assessment_form_initial_extra(None, None))
        return initial

    initial = _enrollment_form_initial_from_registration(reg)
    initial.update(assessment_form_initial_extra(None, reg))
    return initial


def is_assessment_only_program(program_type: str | None) -> bool:
    return program_type == StudentRegistration.ProgramType.ASSESSMENT_ONLY


def enrollment_program_type_for_user(user) -> str:
    profile = get_enrollment_profile(user)
    if profile and profile.program_type:
        return profile.program_type
    reg = getattr(user, "registration_application", None)
    if reg:
        return reg.program_type
    return StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT


def registration_is_enrolled(user) -> bool:
    """True when the registrar has approved the student's registration."""
    reg = getattr(user, "registration_application", None)
    return bool(reg and reg.status == StudentRegistration.Status.APPROVED)


def can_edit_enrollment_application(user) -> bool:
    """Students may revise their application until the registrar approves it."""
    if registration_is_enrolled(user):
        return False
    profile = get_enrollment_profile(user)
    if not profile or not profile.profile_step_completed:
        return False
    return True


def should_redirect_to_enrollment_pending(user) -> bool:
    """Show the waiting page only while approval is still in progress."""
    if registration_is_enrolled(user):
        return False
    reg = getattr(user, "registration_application", None)
    if reg and reg.status == StudentRegistration.Status.REJECTED:
        return False
    profile = get_enrollment_profile(user)
    return bool(profile and profile.requirements_submitted)


def enrollment_pending_review(user) -> bool:
    return should_redirect_to_enrollment_pending(user)


def show_upload_requirements_button(user, profile=None) -> bool:
    """Dashboard CTA — only while Step 2 uploads are still in progress."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if registration_is_enrolled(user):
        return False
    if profile is None:
        profile = get_enrollment_profile(user)
    if not profile or not profile.profile_step_completed:
        return False
    if profile.requirements_submitted:
        return False
    return True


def parse_enrollment_post(post, files=None, *, program_type=None):
    if is_assessment_only_program(program_type):
        return parse_assessment_enrollment_post(post, files)
    return parse_training_enrollment_post(post, files)


def normalize_contact_number(raw):
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("63") and len(digits) >= 12:
        digits = "0" + digits[2:12]
    elif digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    return digits[:11]


def parse_assessment_enrollment_post(post, files=None):
    files = files or {}
    assessment_application = build_assessment_application_payload(post)
    return {
        "tsmis": post.get("tsmis", "").strip(),
        "last_name": post.get("last_name", "").strip(),
        "first_name": post.get("first_name", "").strip(),
        "middle_name": post.get("middle_name", "").strip(),
        "name_extension": post.get("name_extension", "").strip(),
        "email": post.get("email", "").strip().lower(),
        "contact_number": normalize_contact_number(post.get("contact_number", "")),
        "region_code": post.get("region_code", "").strip(),
        "province_code": post.get("province_code", "").strip(),
        "city_code": post.get("city_code", "").strip(),
        "barangay_code": post.get("barangay_code", "").strip(),
        "street_house": post.get("street_house", "").strip(),
        "district": post.get("district", "").strip(),
        "nationality": post.get("nationality", "").strip() or "Filipino",
        "sex": post.get("sex", "").strip(),
        "civil_status": post.get("civil_status", "").strip(),
        "employment_status": post.get("employment_status", "").strip(),
        "employment_type": "",
        "birth_date": post.get("birth_date", "").strip(),
        "birthplace": post.get("birthplace", "").strip(),
        "educational_attainment": post.get("educational_attainment", "").strip(),
        "parent_guardian_name": post.get("mother_name", "").strip(),
        "parent_guardian_address": post.get("father_name", "").strip(),
        "client_classifications": [],
        "disability_types": [],
        "disability_other_specify": "",
        "disability_causes": [],
        "scholarship_type": "",
        "privacy_consent": post.get("privacy_consent") == "1",
        "signature": post.get("signature", "").strip(),
        "photo": files.get("photo"),
        "assessment_application": assessment_application,
    }


def parse_training_enrollment_post(post, files=None):
    files = files or {}
    classifications = [v.strip() for v in post.getlist("client_classification") if v.strip()]
    valid_labels = set(CLIENT_CLASSIFICATIONS)
    classifications = [c for c in classifications if c in valid_labels]

    disability_types = [v.strip() for v in post.getlist("disability_type") if v.strip()]
    disability_types = [d for d in disability_types if d in DISABILITY_TYPES]

    disability_causes = [v.strip() for v in post.getlist("disability_cause") if v.strip()]
    disability_causes = [c for c in disability_causes if c in DISABILITY_CAUSES]

    return {
        "tsmis": post.get("tsmis", "").strip(),
        "uli": post.get("uli", "").strip(),
        "last_name": post.get("last_name", "").strip(),
        "first_name": post.get("first_name", "").strip(),
        "middle_name": post.get("middle_name", "").strip(),
        "name_extension": post.get("name_extension", "").strip(),
        "email": post.get("email", "").strip().lower(),
        "contact_number": normalize_contact_number(post.get("contact_number", "")),
        "region_code": post.get("region_code", "").strip(),
        "province_code": post.get("province_code", "").strip(),
        "city_code": post.get("city_code", "").strip(),
        "barangay_code": post.get("barangay_code", "").strip(),
        "street_house": post.get("street_house", "").strip(),
        "district": post.get("district", "").strip(),
        "nationality": post.get("nationality", "").strip() or "Filipino",
        "sex": post.get("sex", "").strip(),
        "civil_status": post.get("civil_status", "").strip(),
        "employment_status": post.get("employment_status", "").strip(),
        "employment_type": post.get("employment_type", "").strip(),
        "birth_date": post.get("birth_date", "").strip(),
        "birthplace": post.get("birthplace", "").strip(),
        "educational_attainment": post.get("educational_attainment", "").strip(),
        "parent_guardian_name": post.get("parent_guardian_name", "").strip(),
        "parent_guardian_address": post.get("parent_guardian_address", "").strip(),
        "client_classifications": classifications,
        "disability_types": disability_types,
        "disability_other_specify": post.get("disability_other_specify", "").strip(),
        "disability_causes": disability_causes,
        "scholarship_type": post.get("scholarship_type", "").strip(),
        "selected_program": post.get("selected_program", "").strip(),
        "privacy_consent": post.get("privacy_consent") == "1",
        "signature": post.get("signature", "").strip(),
        "photo": files.get("photo"),
    }


def validate_enrollment_data(data, *, require_photo=True, program_type=None):
    if is_assessment_only_program(program_type):
        return validate_assessment_enrollment_data(data, require_photo=require_photo)
    return validate_training_enrollment_data(data, require_photo=require_photo)


def validate_training_enrollment_data(data, *, require_photo=True):
    errors = []
    required = [
        ("last_name", "Last name is required."),
        ("first_name", "First name is required."),
        ("email", "Email / Facebook account is required."),
        ("contact_number", "Contact number is required."),
        ("region_code", "Region is required."),
        ("province_code", "Province is required."),
        ("city_code", "City / Municipality is required."),
        ("barangay_code", "Barangay is required."),
        ("street_house", "Number and street is required."),
        ("nationality", "Nationality is required."),
        ("sex", "Sex is required."),
        ("civil_status", "Civil status is required."),
        ("employment_status", "Employment status is required."),
        ("birth_date", "Birthdate is required."),
        ("birthplace", "Birthplace is required."),
        ("educational_attainment", "Educational attainment is required."),
        ("parent_guardian_name", "Parent/Guardian name is required."),
        ("parent_guardian_address", "Parent/Guardian address is required."),
        ("signature", "Signature is required."),
    ]
    for field, message in required:
        if not data.get(field):
            errors.append(message)

    if not data.get("client_classifications"):
        errors.append("Select at least one client classification.")

    if "Multiple Disabilities" in data.get("disability_types", []) and not data.get(
        "disability_other_specify"
    ):
        errors.append("Please specify multiple disabilities.")

    if data.get("contact_number") and not PH_MOBILE_RE.match(data["contact_number"]):
        errors.append(f"Contact number: {PHONE_MSG}")

    if not data.get("privacy_consent"):
        errors.append("Privacy consent is required.")

    photo = data.get("photo")
    if require_photo and not photo:
        errors.append("1x1 photo is required.")
    elif photo:
        if photo.size > 5 * 1024 * 1024:
            errors.append("Photo must be 5MB or smaller.")
        content_type = getattr(photo, "content_type", "") or ""
        if content_type and content_type not in ("image/jpeg", "image/png"):
            errors.append("Photo must be JPEG or PNG format.")

    valid_sex = {c[0] for c in StudentRegistration.Gender.choices}
    if data.get("sex") and data["sex"] not in valid_sex:
        errors.append("Invalid sex value.")

    valid_civil = {c[0] for c in StudentRegistration.CivilStatus.choices}
    if data.get("civil_status") and data["civil_status"] not in valid_civil:
        errors.append("Invalid civil status.")

    valid_employment = {c[0] for c in EMPLOYMENT_STATUS_CHOICES} | {
        "employed",
        "student",
        "retired",
    }
    if data.get("employment_status") and data["employment_status"] not in valid_employment:
        errors.append("Invalid employment status.")

    if data.get("employment_status") in ("wage_employed", "underemployed"):
        valid_employment_type = {c[0] for c in EMPLOYMENT_TYPE_CHOICES if c[0]}
        if not data.get("employment_type"):
            errors.append("Employment type is required for wage-employed or underemployed.")
        elif data["employment_type"] not in valid_employment_type:
            errors.append("Invalid employment type.")

    valid_education = {c[0] for c in EDUCATIONAL_ATTAINMENT_CHOICES} | {
        "elementary",
        "high_school",
        "vocational",
        "post_graduate",
    }
    if data.get("educational_attainment") and data["educational_attainment"] not in valid_education:
        errors.append("Invalid educational attainment.")

    valid_scholarship = {c[0] for c in SCHOLARSHIP_TYPE_CHOICES}
    if data.get("scholarship_type") and data["scholarship_type"] not in valid_scholarship:
        errors.append("Invalid scholarship type.")

    program = data.get("selected_program", "").strip()
    if not program:
        errors.append("Course / Qualification is required.")
    elif program not in enrollment_program_options():
        errors.append("Invalid course / qualification selection.")

    return errors


def _registration_for_user(user):
    try:
        return user.registration_application
    except StudentRegistration.DoesNotExist:
        return None


def save_enrollment_profile(user, data):
    """Create or update the student's TESDA enrollment profile."""
    from datetime import datetime

    from django.utils import timezone

    reg = _registration_for_user(user)
    program_type = reg.program_type if reg else StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT
    profile_existing = get_enrollment_profile(user)
    selected_program = (
        data.get("selected_program", "").strip()
        or (profile_existing.selected_program if profile_existing else "")
        or (reg.selected_program if reg else "")
        or enrollment_program_options()[0]
    )
    options = enrollment_program_options()
    if selected_program not in options:
        selected_program = reg.selected_program if reg else options[0]
    tsmis = data.get("tsmis") or (reg.reference_id if reg else "")

    if not data.get("birth_date"):
        raise ValueError("Birthdate is required.")
    try:
        birth_date = datetime.strptime(data["birth_date"], "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Invalid birthdate format.") from exc

    profile = get_enrollment_profile(user)
    created = profile is None
    if created:
        profile = StudentEnrollmentProfile(user=user, entry_date=timezone.localdate())
    elif not profile.entry_date:
        profile.entry_date = timezone.localdate()

    if reg:
        profile.registration = reg

    profile.tsmis = tsmis
    if "uli" in data:
        profile.uli = data["uli"]
    profile.last_name = data["last_name"]
    profile.first_name = data["first_name"]
    profile.middle_name = data.get("middle_name", "")
    profile.name_extension = data.get("name_extension", "")
    profile.email = data["email"]
    profile.contact_number = data["contact_number"]
    profile.region_code = data["region_code"]
    profile.province_code = data["province_code"]
    profile.city_code = data["city_code"]
    profile.barangay_code = data["barangay_code"]
    profile.street_house = data.get("street_house", "")
    profile.district = data.get("district", "")
    profile.nationality = data.get("nationality", "Filipino")
    profile.sex = data["sex"]
    profile.civil_status = data.get("civil_status", "")
    profile.employment_status = data.get("employment_status", "")
    profile.employment_type = data.get("employment_type", "")
    profile.birth_date = birth_date
    profile.birthplace = data.get("birthplace", "")
    profile.educational_attainment = data.get("educational_attainment", "")
    profile.parent_guardian_name = data.get("parent_guardian_name", "")
    profile.parent_guardian_address = data.get("parent_guardian_address", "")
    profile.client_classifications = data.get("client_classifications", [])
    profile.disability_types = data.get("disability_types", [])
    profile.disability_other_specify = data.get("disability_other_specify", "")
    profile.disability_causes = data.get("disability_causes", [])
    profile.selected_program = selected_program
    profile.program_type = program_type
    profile.scholarship_type = data.get("scholarship_type", "")
    if reg and not is_assessment_only_program(program_type):
        if reg.selected_program != selected_program:
            reg.selected_program = selected_program
            reg.save(update_fields=["selected_program"])
    if is_assessment_only_program(program_type):
        profile.assessment_application_data = merge_assessment_application_data(
            data.get("assessment_application")
        )
        aa = profile.assessment_application_data
        if aa.get("assessment_title"):
            profile.selected_program = aa["assessment_title"]
    profile.privacy_consent = data["privacy_consent"]
    profile.signature = data["signature"]
    if not profile.date_accomplished:
        profile.date_accomplished = timezone.localdate()
    profile.profile_step_completed = True

    photo = data.get("photo")
    if photo:
        if profile.photo:
            profile.photo.delete(save=False)
        profile.photo = photo

    profile.save()

    # reset_document_reviews queries profile.documents — requires pk (existing profile only)
    if photo and not created:
        from .document_review import reset_document_reviews

        reset_document_reviews(profile)

    return profile, created


def student_enrollment_context(request):
    from django.utils import timezone

    initial = _enrollment_form_initial(request.user) if request.user.is_authenticated else {}
    profile = get_enrollment_profile(request.user)
    program_type = enrollment_program_type_for_user(request.user)
    is_assessment_only = is_assessment_only_program(program_type)
    today = timezone.localdate()
    entry_date = profile.entry_date if profile else today
    address_initial = {
        "region": initial.get("region_code", ""),
        "province": initial.get("province_code", ""),
        "cityMunicipality": initial.get("city_code", ""),
        "barangay": initial.get("barangay_code", ""),
    }

    return _student_portal_base(
        request,
        active_menu="Enrollment",
        page_title="Enrollment Process",
        page_subtitle="Complete your enrollment step by step",
        enrollment_step_label=(
            "Step 1: TESDA Application Form"
            if is_assessment_only
            else "Step 1: Learner's Profile Form (TESDA)"
        ),
        is_assessment_only=is_assessment_only,
        program_type=program_type,
        assessment_client_types=ASSESSMENT_CLIENT_TYPES,
        assessment_type_options=ASSESSMENT_TYPE_OPTIONS,
        tesda_employment_choices=TESDA_ASSESSMENT_EMPLOYMENT_CHOICES,
        tesda_education_choices=TESDA_ASSESSMENT_EDUCATION_CHOICES,
        assessment_default_school_name=ASSESSMENT_DEFAULT_SCHOOL_NAME,
        assessment_default_school_address=ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
        entry_date_display=entry_date.strftime("%m/%d/%y"),
        tsmis_display=initial.get("reference_id") or "AUTO-GENERATED",
        has_existing_photo=initial.get("has_existing_photo", False),
        name_extensions=NAME_EXTENSIONS,
        employment_status_choices=EMPLOYMENT_STATUS_CHOICES,
        employment_type_choices=EMPLOYMENT_TYPE_CHOICES,
        educational_attainment_choices=EDUCATIONAL_ATTAINMENT_CHOICES,
        civil_status_choices=StudentRegistration.CivilStatus.choices,
        date_accomplished_display=(
            profile.date_accomplished.strftime("%m/%d/%y")
            if profile and profile.date_accomplished
            else today.strftime("%m/%d/%y")
        ),
        noted_by_display=profile.noted_by if profile else "",
        date_received_display=(
            profile.date_received.strftime("%m/%d/%y")
            if profile and profile.date_received
            else ""
        ),
        scholarship_type_choices=SCHOLARSHIP_TYPE_CHOICES,
        client_classifications=CLIENT_CLASSIFICATIONS,
        disability_types=DISABILITY_TYPES,
        disability_causes=DISABILITY_CAUSES,
        form_initial=initial,
        address_initial=address_initial,
        program_name=initial.get("program_name", "Automotive Servicing NC I"),
        program_type_label=initial.get("program_type_label", "Training with Assessment"),
        enrollment_program_options=enrollment_program_options(),
        can_continue_to_requirements=bool(profile and profile.profile_step_completed),
        can_edit_enrollment=can_edit_enrollment_application(request.user),
        enrollment_under_review=enrollment_pending_review(request.user),
    )


def student_dashboard_context(request=None):
    if request is None:
        snapshot = {}
    else:
        snapshot = _registration_snapshot(request.user) if request.user.is_authenticated else {}

    profile = get_enrollment_profile(request.user) if request and request.user.is_authenticated else None
    registration = (
        getattr(request.user, "registration_application", None)
        if request and request.user.is_authenticated
        else None
    )
    requirements = dashboard_requirements_from_profile(profile)
    doc_count = profile.documents.count() if profile else 0
    doc_total = 5
    enrollment_steps = build_enrollment_steps_timeline(profile, registration)
    announcements = [
        {
            "title": "Assessment Schedule Available",
            "body": "NC II Assessment for Automotive Servicing has been posted. Check your email for room assignment.",
            "date": "April 3, 2026",
        },
        {
            "title": "Document Submission Deadline",
            "body": "Please submit all remaining requirements on or before April 10, 2026.",
            "date": "April 2, 2026",
        },
        {
            "title": "New Training Schedule",
            "body": "Morning batch classes for Automotive Servicing NC I will begin next week.",
            "date": "March 31, 2026",
        },
    ]

    if request is None:
        user = None
        base = {
            "page_title": "Student Dashboard",
            "page_subtitle": "View your enrollment status and manage your profile.",
            "active_menu": "Dashboard",
            "sidebar_menu": _student_sidebar_menu(user),
            "notification_count": 0,
            "progress_percent": snapshot.get("progress_percent", 25),
            **snapshot,
        }
    else:
        base = _student_portal_base(
            request,
            active_menu="Dashboard",
            page_title="Student Dashboard",
            page_subtitle="View your enrollment status and manage your profile.",
        )

    from backend.student.payments import payment_statement

    progress_percent = base.get("progress_percent", 25)
    ring_circ = round(2 * math.pi * 54, 2)
    ring_offset = round(ring_circ * (1 - progress_percent / 100), 2)
    statement = payment_statement(profile)
    from backend.student.payment_records import dashboard_payment_display

    payment_card = dashboard_payment_display(profile, registration)
    payment_status = payment_card["payment_status"]
    payment_badge = payment_card["payment_badge"]
    payment_badge_class = payment_card["payment_badge_class"]
    app_status = application_status_label(profile, registration)
    if registration and registration.status == StudentRegistration.Status.APPROVED:
        app_status = "Enrolled"

    schedule_ctx = dashboard_schedule_context(profile, registration)
    user = request.user if request and request.user.is_authenticated else None
    show_upload_btn = show_upload_requirements_button(user, profile)

    return {
        "progress_ring_circumference": ring_circ,
        "progress_ring_offset": ring_offset,
        "application_status": app_status,
        "show_upload_requirements_button": show_upload_btn,
        "payment_status": payment_status,
        "payment_balance": statement["balance_display"],
        "payment_badge": payment_badge,
        "payment_badge_class": payment_badge_class,
        "payments_read_only": True,
        "documents_uploaded": doc_count,
        "documents_total": doc_total,
        "documents_badge": "Complete" if profile and profile.requirements_submitted else "In Progress",
        "requirements": requirements,
        "enrollment_steps": enrollment_steps,
        "announcements": announcements,
        **schedule_ctx,
        **base,
    }


def parse_registration_post(post):
    """Read registration wizard fields from request.POST."""
    return {
        "first_name": post.get("first_name", "").strip(),
        "middle_name": post.get("middle_name", "").strip(),
        "last_name": post.get("last_name", "").strip(),
        "email": post.get("email", "").strip().lower(),
        "phone_number": post.get("phone_number", "").strip(),
        "region_code": post.get("region_code", "").strip(),
        "province_code": post.get("province_code", "").strip(),
        "city_code": post.get("city_code", "").strip(),
        "barangay_code": post.get("barangay_code", "").strip(),
        "zip_code": post.get("zip_code", "").strip(),
        "street_house": post.get("street_house", "").strip(),
        "birth_date": post.get("birth_date", "").strip(),
        "gender": post.get("gender", "").strip(),
        "civil_status": post.get("civil_status", "").strip(),
        "educational_attainment": post.get("educational_attainment", "").strip(),
        "emergency_name": post.get("emergency_name", "").strip(),
        "emergency_phone": post.get("emergency_phone", "").strip(),
        "program_type": post.get("program_type", "").strip(),
        "selected_program": post.get("selected_program", "").strip(),
        "preferred_schedule": post.get("preferred_schedule", "").strip(),
        "password": post.get("password", ""),
        "password_confirm": post.get("password_confirm", ""),
    }


def email_is_already_registered(email):
    """True if the email is already used by a user account or student registration."""
    normalized = (email or "").strip().lower()
    if not normalized:
        return False
    if User.objects.filter(email__iexact=normalized).exists():
        return True
    if StudentRegistration.objects.filter(email__iexact=normalized).exists():
        return True
    return False


EMAIL_ALREADY_REGISTERED_MSG = (
    "This email is already registered. Please sign in or use a different email."
)


def validate_registration_data(data):
    """Return a list of user-facing error messages (empty if valid)."""
    errors = []
    if not enrollment_is_open():
        errors.append("New student registration is currently closed. Please try again later.")
        return errors

    required = [
        ("first_name", "First name is required."),
        ("last_name", "Last name is required."),
        ("email", "Email address is required."),
        ("phone_number", "Phone number is required."),
        ("region_code", "Region is required."),
        ("province_code", "Province is required."),
        ("city_code", "City/Municipality is required."),
        ("barangay_code", "Barangay is required."),
        ("birth_date", "Birth date is required."),
        ("gender", "Gender is required."),
        ("civil_status", "Civil status is required."),
        ("emergency_name", "Emergency contact name is required."),
        ("emergency_phone", "Emergency contact phone is required."),
        ("program_type", "Program type is required."),
        ("selected_program", "Program selection is required."),
        ("password", "Password is required."),
        ("password_confirm", "Password confirmation is required."),
    ]
    for field, message in required:
        if not data.get(field):
            errors.append(message)

    if data.get("email") and email_is_already_registered(data["email"]):
        errors.append(EMAIL_ALREADY_REGISTERED_MSG)

    if data.get("password") and len(data["password"]) < 8:
        errors.append("Password must be at least 8 characters.")

    if data.get("password") != data.get("password_confirm"):
        errors.append("Passwords do not match.")

    for phone_field in ("phone_number", "emergency_phone"):
        phone = data.get(phone_field, "")
        if phone and not PH_MOBILE_RE.match(phone):
            errors.append(f"{phone_field.replace('_', ' ').title()}: {PHONE_MSG}")

    valid_program_types = {c[0] for c in StudentRegistration.ProgramType.choices}
    if data.get("program_type") and data["program_type"] not in valid_program_types:
        errors.append("Invalid program type.")

    if (
        data.get("program_type") == StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT
        and not data.get("preferred_schedule")
    ):
        errors.append("Preferred schedule is required.")

    valid_schedules = {c[0] for c in StudentRegistration.PreferredSchedule.choices}
    if data.get("preferred_schedule") and data["preferred_schedule"] not in valid_schedules:
        errors.append("Invalid preferred schedule.")

    program = (data.get("selected_program") or "").strip()
    if program and program not in enrollment_program_options():
        errors.append("Invalid program selection.")

    return errors


def create_student_registration(data):
    """Create User, StudentProfile, and StudentRegistration. Returns registration instance."""
    password = data.pop("password")
    data.pop("password_confirm", None)
    email = data["email"]

    with transaction.atomic():
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=data["first_name"],
            last_name=data["last_name"],
        )
        StudentProfile.objects.create(user=user)
        return StudentRegistration.objects.create(user=user, **data)
