import re

from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db import IntegrityError
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET

from backend.accounts.services import require_portal_access

from .enrollment_requirements import (
    remove_rejected_enrollment_document,
    save_enrollment_document,
    student_enrollment_requirements_context,
    submit_enrollment_requirements,
)
from .payment_proof import save_payment_proof
from .payments import (
    student_enrollment_pending_context,
    student_payments_context,
)
from .schedule_assignment import save_student_schedule_choice
from .student_settings import student_settings_context
from backend.student.services import (
    EMAIL_ALREADY_REGISTERED_MSG,
    STUDENT_ROLE,
    create_student_registration,
    email_is_already_registered,
    get_enrollment_profile,
    parse_enrollment_post,
    parse_registration_post,
    can_edit_enrollment_application,
    enrollment_program_type_for_user,
    registration_is_enrolled,
    save_enrollment_profile,
    should_redirect_to_enrollment_pending,
    student_dashboard_context,
    student_enrollment_context,
    validate_enrollment_data,
    validate_registration_data,
)
from backend.system_admin.program_config import enrollment_is_open, enrollment_program_options

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

def register(request):
    """
    """
    show_confirmation = request.session.pop("registration_submitted", False)
    if not show_confirmation and request.session.pop("registration_reference_id", None):
        show_confirmation = True

    if request.method == "POST":
        if not enrollment_is_open():
            messages.error(request, "New student registration is currently closed.")
            return redirect("register")

        data = parse_registration_post(request.POST)
        errors = validate_registration_data(data)

        if errors:
            return redirect("register")

        try:
            create_student_registration(data)
        except IntegrityError:
            return redirect("register")
        except Exception:
            return redirect("register")

        request.session["registration_submitted"] = True
        return redirect("register")

    return render(
        request,
        "registration/register.html",
        {
            "show_confirmation": show_confirmation,
            "enrollment_open": enrollment_is_open(),
            "registration_config": {
                "enrollmentOpen": enrollment_is_open(),
                "programs": list(enrollment_program_options()),
            },
        },
    )


@require_GET
def check_register_email(request):
    """JSON endpoint for live duplicate-email checks during registration."""
    email = request.GET.get("email", "").strip().lower()
    if not email:
        return JsonResponse({"available": False, "message": "Email address is required."})
    if not _EMAIL_RE.match(email):
        return JsonResponse({"available": False, "message": "Invalid email address."})
    if email_is_already_registered(email):
        return JsonResponse({"available": False, "message": EMAIL_ALREADY_REGISTERED_MSG})
    return JsonResponse({"available": True, "message": ""})


@login_required(login_url="/")
def dashboard(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    if request.method == "POST" and request.POST.get("action") == "select_schedule":
        profile = get_enrollment_profile(request.user)
        option_id = request.POST.get("schedule_option_id", "")
        if not profile:
            messages.warning(request, "Complete your enrollment profile before selecting a schedule.")
        elif not registration_is_enrolled(request.user):
            messages.info(
                request,
                "Your class schedule will be available after enrollment is fully approved.",
            )
        elif not option_id:
            messages.error(request, "Please choose a schedule option.")
        else:
            try:
                save_student_schedule_choice(profile, int(option_id))
                messages.success(request, "Your preferred class schedule has been saved.")
            except (ValueError, TypeError) as exc:
                messages.error(request, str(exc))
        return redirect("student_dashboard")

    return render(request, "student/dashboard.html", student_dashboard_context(request))


@login_required(login_url="/")
def enrollment(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    profile = get_enrollment_profile(request.user)

    if request.method == "POST":
        existing = get_enrollment_profile(request.user)
        program_type = enrollment_program_type_for_user(request.user)
        data = parse_enrollment_post(
            request.POST, request.FILES, program_type=program_type
        )
        errors = validate_enrollment_data(
            data,
            require_photo=not (existing and existing.photo),
            program_type=program_type,
        )

        if errors:
            for msg in errors:
                messages.error(request, msg)
            return redirect("student_enrollment")

        try:
            save_enrollment_profile(request.user, data)
        except (ValueError, TypeError) as exc:
            messages.error(request, f"Could not save enrollment profile: {exc}")
            return redirect("student_enrollment")
        except IntegrityError:
            messages.error(
                request,
                "Could not save enrollment profile. Please try again or contact support.",
            )
            return redirect("student_enrollment")

        if program_type == "assessment_only":
            messages.success(request, "TESDA application form saved successfully.")
        else:
            messages.success(request, "Learner profile saved successfully.")
        profile = get_enrollment_profile(request.user)
        if registration_is_enrolled(request.user):
            messages.success(request, "Your enrollment has been approved.")
            return redirect("student_dashboard")
        if profile and should_redirect_to_enrollment_pending(request.user):
            return redirect("student_enrollment_pending")
        return redirect("student_enrollment_requirements")

    if registration_is_enrolled(request.user):
        return redirect("student_dashboard")
    if (
        profile
        and should_redirect_to_enrollment_pending(request.user)
        and not can_edit_enrollment_application(request.user)
    ):
        return redirect("student_enrollment_pending")

    return render(request, "student/enrollment.html", student_enrollment_context(request))


@login_required(login_url="/")
def enrollment_requirements(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    profile = get_enrollment_profile(request.user)
    if not profile or not profile.profile_step_completed:
        messages.warning(request, "Please complete Step 1: Learner's Profile Form first.")
        return redirect("student_enrollment")

    if request.method == "POST":
        action = request.POST.get("action", "")

        if action == "upload":
            doc_type = request.POST.get("document_type", "")
            uploaded = request.FILES.get("file")
            id_type = request.POST.get("id_type", "")
            try:
                save_enrollment_document(profile, doc_type, uploaded, id_type=id_type)
                messages.success(request, "Document uploaded successfully.")
            except ValueError as exc:
                messages.error(request, str(exc))
            return redirect("student_enrollment_requirements")

        if action == "remove_rejected":
            doc_type = request.POST.get("document_type", "")
            try:
                remove_rejected_enrollment_document(profile, doc_type)
                messages.success(request, "Rejected file removed. You can upload a replacement.")
            except ValueError as exc:
                messages.error(request, str(exc))
            return redirect("student_enrollment_requirements")

        if action == "submit":
            errors = submit_enrollment_requirements(profile)
            if errors:
                for msg in errors:
                    messages.error(request, msg)
                return redirect("student_enrollment_requirements")
            messages.success(
                request,
                "Your requirements have been submitted for approval.",
            )
            if registration_is_enrolled(request.user):
                messages.success(request, "Your enrollment has been approved.")
                return redirect("student_dashboard")
            return redirect("student_enrollment_pending")

    if registration_is_enrolled(request.user):
        return redirect("student_dashboard")
    if (
        should_redirect_to_enrollment_pending(request.user)
        and not can_edit_enrollment_application(request.user)
    ):
        return redirect("student_enrollment_pending")

    return render(
        request,
        "student/enrollment_requirements.html",
        student_enrollment_requirements_context(request),
    )


@login_required(login_url="/")
def enrollment_pending(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    profile = get_enrollment_profile(request.user)
    if not profile or not profile.profile_step_completed:
        messages.warning(request, "Please complete Step 1: Learner's Profile Form first.")
        return redirect("student_enrollment")
    if not profile.requirements_submitted:
        return redirect("student_enrollment_requirements")

    if registration_is_enrolled(request.user):
        messages.success(
            request,
            "Your enrollment has been approved. You are now listed as enrolled.",
        )
        return redirect("student_dashboard")

    return render(
        request,
        "student/enrollment_pending.html",
        student_enrollment_pending_context(request),
    )


@login_required(login_url="/")
def payments(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    from .document_review import documents_cleared_for_payment

    profile = get_enrollment_profile(request.user)

    if (
        profile
        and profile.requirements_submitted
        and not documents_cleared_for_payment(profile)
        and not registration_is_enrolled(request.user)
    ):
        messages.info(
            request,
            "Please wait for the registrar to approve your documents before proceeding to payment.",
        )
        return redirect("student_enrollment_pending")

    if request.method == "POST" and request.POST.get("action") == "upload_payment_proof":
        uploaded = request.FILES.get("file")
        reference_note = request.POST.get("reference_note", "")
        try:
            save_payment_proof(profile, uploaded, reference_note=reference_note)
            messages.success(request, "Proof of payment uploaded successfully.")
        except ValueError as exc:
            messages.error(request, str(exc))
        return redirect("student_payments")

    return render(request, "student/payments.html", student_payments_context(request))


@login_required(login_url="/")
def settings(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied
    return render(request, "student/settings.html", student_settings_context(request))