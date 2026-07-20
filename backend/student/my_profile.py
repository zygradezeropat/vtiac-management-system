"""Post-enrollment My Profile — view and update learner records."""

from django.shortcuts import redirect

from .enrollment_requirements import ID_TYPE_CHOICES, build_requirements_rows
from .services import (
    ASSESSMENT_CLIENT_TYPES,
    ASSESSMENT_DEFAULT_SCHOOL_ADDRESS,
    ASSESSMENT_DEFAULT_SCHOOL_NAME,
    ASSESSMENT_TYPE_OPTIONS,
    CLIENT_CLASSIFICATIONS,
    DISABILITY_CAUSES,
    DISABILITY_TYPES,
    EDUCATIONAL_ATTAINMENT_CHOICES,
    EMPLOYMENT_STATUS_CHOICES,
    EMPLOYMENT_TYPE_CHOICES,
    NAME_EXTENSIONS,
    SCHOLARSHIP_TYPE_CHOICES,
    TESDA_ASSESSMENT_EDUCATION_CHOICES,
    TESDA_ASSESSMENT_EMPLOYMENT_CHOICES,
    _enrollment_form_initial,
    _student_portal_base,
    enrollment_program_type_for_user,
    get_enrollment_profile,
    is_assessment_only_program,
    registration_is_enrolled,
)
from .models import StudentRegistration
from backend.system_admin.program_config import enrollment_program_options


def can_access_my_profile(user) -> bool:
    """Enrolled students with a completed learner profile may use My Profile."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if not registration_is_enrolled(user):
        return False
    profile = get_enrollment_profile(user)
    return bool(profile and profile.profile_step_completed)


def my_profile_guard(request):
    """Redirect if the user cannot access My Profile. Returns redirect or None."""
    if not can_access_my_profile(request.user):
        return redirect("student_dashboard")
    return None


def student_my_profile_context(request):
    from django.utils import timezone

    initial = _enrollment_form_initial(request.user)
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
        active_menu="My Profile",
        page_title="My Profile",
        page_subtitle="View and update your enrollment records anytime",
        my_profile_tab="profile",
        records_mode=True,
        enrollment_step_label=(
            "TESDA Application Form"
            if is_assessment_only
            else "Learner's Profile (TESDA)"
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
    )


def student_my_profile_requirements_context(request):
    profile = get_enrollment_profile(request.user)
    program_type = enrollment_program_type_for_user(request.user)

    return _student_portal_base(
        request,
        active_menu="My Profile",
        page_title="My Profile",
        page_subtitle="View and update your enrollment records anytime",
        my_profile_tab="requirements",
        records_mode=True,
        enrollment_step_label="Enrollment Requirements",
        enrollment_step_icon="bi-cloud-upload",
        requirements_rows=build_requirements_rows(profile) if profile else [],
        id_type_choices=ID_TYPE_CHOICES,
        requirements_submitted=bool(profile and profile.requirements_submitted),
        can_edit_requirements=True,
        requirements_post_url_name="student_my_profile_requirements",
        is_assessment_only=is_assessment_only_program(program_type),
    )
