import re

from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db import IntegrityError
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.template.loader import render_to_string
from django.urls import reverse
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
    candidate_dashboard_context,
    is_assessment_only_user,
    student_enrollment_context,
    validate_enrollment_data,
    validate_registration_data,
)
from .my_profile import (
    my_profile_guard,
    student_my_profile_context,
    student_my_profile_requirements_context,
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

    from backend.system_admin.assessments import enrollment_assessment_options
    from backend.system_admin.schedules import enrollment_schedule_options

    return render(
        request,
        "registration/register.html",
        {
            "show_confirmation": show_confirmation,
            "enrollment_open": enrollment_is_open(),
            "registration_config": {
                "enrollmentOpen": enrollment_is_open(),
                "programs": list(enrollment_program_options()),
                "assessments": list(enrollment_assessment_options()),
                "schedules": list(enrollment_schedule_options()),
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

    if is_assessment_only_user(request.user):
        return redirect("candidate_dashboard")

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
def candidate_dashboard(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    if not is_assessment_only_user(request.user):
        return redirect("student_dashboard")

    return render(request, "candidate/dashboard.html", candidate_dashboard_context(request))


@login_required(login_url="/")
def enrollment(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    profile = get_enrollment_profile(request.user)

    if request.method == "POST":
        existing = get_enrollment_profile(request.user)
        program_type = enrollment_program_type_for_user(request.user)
        action = request.POST.get("action", "")

        is_draft = action == "save_draft"

        data = parse_enrollment_post(
            request.POST,
            request.FILES,
            program_type=program_type,
        )
        # logic for drafting
        if is_draft:
            try:
                save_enrollment_profile(
                    request.user,
                    data,
                    is_draft=True,
                )

            except (ValueError, TypeError) as exc:
                messages.error(
                    request,
                    f"Could not save enrollment draft: {exc}",
                )
                return redirect("student_enrollment")

            except IntegrityError:
                messages.error(
                    request,
                    "Could not save enrollment draft. "
                    "Please try again or contact support.",
                )
                return redirect("student_enrollment")

            messages.success(
                request,
                "Your enrollment progress has been saved as a draft.",
            )

            return redirect("student_enrollment")

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
            save_enrollment_profile(
                request.user,
                data,
                is_draft=False,
            )

        except (ValueError, TypeError) as exc:
            messages.error(
                request,
                f"Could not save enrollment profile: {exc}",
            )
            return redirect("student_enrollment")

        except IntegrityError:
            messages.error(
                request,
                "Could not save enrollment profile. "
                "Please try again or contact support.",
            )
            return redirect("student_enrollment")

        # message save as we can see duh
        if program_type == "assessment_only":
            messages.success(
                request,
                "TESDA application form saved successfully.",
            )
        else:
            messages.success(
                request,
                "Learner profile saved successfully.",
            )

        profile = get_enrollment_profile(request.user)

        # ---------------------------------------------------------
        # EXISTING REDIRECT LOGIC
        # ---------------------------------------------------------
        if registration_is_enrolled(request.user):
            messages.success(
                request,
                "Your profile has been updated successfully.",
            )
            return redirect("student_my_profile")

        if profile and should_redirect_to_enrollment_pending(request.user):
            return redirect("student_enrollment_pending")

        return redirect("student_enrollment_requirements")

    # -------------------------------------------------------------
    # GET REQUEST
    # -------------------------------------------------------------
    if registration_is_enrolled(request.user):
        return redirect("student_my_profile")

    if not profile or not profile.profile_step_completed:
        return render(
            request,
            "student/enrollment.html",
            student_enrollment_context(request),
        )

    if (
        should_redirect_to_enrollment_pending(request.user)
        and not can_edit_enrollment_application(request.user)
    ):
        return redirect("student_enrollment_pending")

    return render(
        request,
        "student/enrollment.html",
        student_enrollment_context(request),
    )

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
        is_ajax = (
            request.headers.get("x-requested-with") == "XMLHttpRequest"
            or "application/json" in request.headers.get("Accept", "")
        )

        if action == "upload":
            doc_type = request.POST.get("document_type", "")
            uploaded = request.FILES.get("file")
            id_type = request.POST.get("id_type", "")
            try:
                doc = save_enrollment_document(profile, doc_type, uploaded, id_type=id_type)
                if is_ajax:
                    ctx = student_enrollment_requirements_context(request)
                    html_snippet = render_to_string(
                        "components/student/enrollment_requirements_list.html",
                        ctx,
                        request=request,
                    )
                    return JsonResponse({
                        "ok": True,
                        "message": "Document uploaded successfully.",
                        "document_type": doc_type,
                        "filename": getattr(doc, "original_filename", ""),
                        "file_url": doc.file.url if doc and doc.file else "",
                        "progress_percent": ctx.get("progress_percent", 50),
                        "digital_status": ctx["doc_indicators"]["digital"]["status"],
                        "digital_label": ctx["doc_indicators"]["digital"]["label"],
                        "digital_badge_class": ctx["doc_indicators"]["digital"]["badgeClass"],
                        "digital_is_uploaded": ctx["doc_indicators"]["digital"]["isUploaded"],
                        "digital_uploaded_count": ctx["doc_indicators"]["digital"]["uploadedCount"],
                        "digital_required_count": ctx["doc_indicators"]["digital"]["requiredCount"],
                        "requirements_list_html": html_snippet,
                    })
                messages.success(request, "Document uploaded successfully.")
            except ValueError as exc:
                if is_ajax:
                    return JsonResponse({"ok": False, "error": str(exc)}, status=400)
                messages.error(request, str(exc))
            return redirect("student_enrollment_requirements")

        if action in ("remove", "remove_rejected", "cancel"):
            doc_type = request.POST.get("document_type", "")
            try:
                from .enrollment_requirements import remove_enrollment_document
                remove_enrollment_document(profile, doc_type)
                if is_ajax:
                    ctx = student_enrollment_requirements_context(request)
                    html_snippet = render_to_string(
                        "components/student/enrollment_requirements_list.html",
                        ctx,
                        request=request,
                    )
                    return JsonResponse({
                        "ok": True,
                        "message": "File removed successfully.",
                        "document_type": doc_type,
                        "progress_percent": ctx.get("progress_percent", 50),
                        "digital_status": ctx["doc_indicators"]["digital"]["status"],
                        "digital_label": ctx["doc_indicators"]["digital"]["label"],
                        "digital_badge_class": ctx["doc_indicators"]["digital"]["badgeClass"],
                        "digital_is_uploaded": ctx["doc_indicators"]["digital"]["isUploaded"],
                        "digital_uploaded_count": ctx["doc_indicators"]["digital"]["uploadedCount"],
                        "digital_required_count": ctx["doc_indicators"]["digital"]["requiredCount"],
                        "requirements_list_html": html_snippet,
                    })
                messages.success(request, "File removed.")
            except ValueError as exc:
                if is_ajax:
                    return JsonResponse({"ok": False, "error": str(exc)}, status=400)
                messages.error(request, str(exc))
            return redirect("student_enrollment_requirements")

        if action == "submit":
            errors = submit_enrollment_requirements(profile)
            if errors:
                if is_ajax:
                    return JsonResponse({"ok": False, "errors": errors}, status=400)
                for msg in errors:
                    messages.error(request, msg)
                return redirect("student_enrollment_requirements")

            is_assessment_only = is_assessment_only_user(request.user)
            success_msg = (
                "Your assessment application requirements have been submitted for verification."
                if is_assessment_only
                else "Your requirements have been submitted for approval."
            )
            messages.success(request, success_msg)
            if is_assessment_only:
                redirect_url = reverse("candidate_dashboard")
            elif registration_is_enrolled(request.user):
                redirect_url = reverse("student_dashboard")
            else:
                redirect_url = reverse("student_enrollment_pending")
            if is_ajax:
                return JsonResponse({
                    "ok": True,
                    "message": success_msg,
                    "redirect_url": redirect_url,
                })
            return redirect(redirect_url)

    if registration_is_enrolled(request.user):
        return redirect("student_my_profile")
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
    from .document_review import documents_cleared_for_payment

    if not profile.requirements_submitted and not documents_cleared_for_payment(profile):
        return redirect("student_enrollment_requirements")

    if registration_is_enrolled(request.user):
        return redirect("student_my_profile")

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

    if not registration_is_enrolled(request.user):
        messages.warning(
            request,
            "The Payments module is temporarily disabled and will be accessible once your enrollment is confirmed.",
        )
        return redirect("student_dashboard")

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
def my_profile(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    blocked = my_profile_guard(request)
    if blocked:
        return blocked

    profile = get_enrollment_profile(request.user)

    if request.method == "POST":
        program_type = enrollment_program_type_for_user(request.user)
        data = parse_enrollment_post(
            request.POST, request.FILES, program_type=program_type
        )
        errors = validate_enrollment_data(
            data,
            require_photo=not (profile and profile.photo),
            program_type=program_type,
        )

        if errors:
            for msg in errors:
                messages.error(request, msg)
            return redirect("student_my_profile")

        try:
            save_enrollment_profile(request.user, data)
        except (ValueError, TypeError) as exc:
            messages.error(request, f"Could not save profile: {exc}")
            return redirect("student_my_profile")
        except IntegrityError:
            messages.error(
                request,
                "Could not save profile. Please try again or contact support.",
            )
            return redirect("student_my_profile")

        messages.success(request, "Your profile has been updated successfully.")
        return redirect("student_my_profile")

    return render(request, "student/my_profile.html", student_my_profile_context(request))


@login_required(login_url="/")
def my_profile_requirements(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    blocked = my_profile_guard(request)
    if blocked:
        return blocked

    profile = get_enrollment_profile(request.user)

    if request.method == "POST":
        action = request.POST.get("action", "")
        is_ajax = (
            request.headers.get("x-requested-with") == "XMLHttpRequest"
            or "application/json" in request.headers.get("Accept", "")
        )

        if action == "upload":
            doc_type = request.POST.get("document_type", "")
            uploaded = request.FILES.get("file")
            id_type = request.POST.get("id_type", "")
            try:
                doc = save_enrollment_document(
                    profile,
                    doc_type,
                    uploaded,
                    id_type=id_type,
                    records_mode=True,
                )
                if is_ajax:
                    return JsonResponse({
                        "ok": True,
                        "message": "Document updated successfully.",
                        "document_type": doc_type,
                        "filename": getattr(doc, "original_filename", ""),
                        "file_url": doc.file.url if doc and doc.file else "",
                    })
                messages.success(request, "Document updated successfully.")
            except ValueError as exc:
                if is_ajax:
                    return JsonResponse({"ok": False, "error": str(exc)}, status=400)
                messages.error(request, str(exc))
            return redirect("student_my_profile_requirements")

        if action in ("remove", "remove_rejected", "cancel"):
            doc_type = request.POST.get("document_type", "")
            try:
                from .enrollment_requirements import remove_enrollment_document
                remove_enrollment_document(profile, doc_type)
                if is_ajax:
                    return JsonResponse({"ok": True, "message": "File removed."})
                messages.success(request, "File removed.")
            except ValueError as exc:
                if is_ajax:
                    return JsonResponse({"ok": False, "error": str(exc)}, status=400)
                messages.error(request, str(exc))
            return redirect("student_my_profile_requirements")

    return render(
        request,
        "student/my_profile_requirements.html",
        student_my_profile_requirements_context(request),
    )


@login_required(login_url="/")
def settings(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied
    return render(request, "student/settings.html", student_settings_context(request))




@login_required
def trainer_evaluation(request):
    from backend.student.services import registration_is_enrolled, student_trainer_evaluation_context
    from backend.system_admin.program_config import (
        trainer_evaluation_is_open,
        trainer_evaluation_status,
    )
    
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied

    if not registration_is_enrolled(request.user):
        messages.warning(
            request,
            "Trainer Evaluation is temporarily disabled and will be accessible once your enrollment is confirmed.",
        )
        return redirect("student_dashboard")

    eval_open = trainer_evaluation_is_open()
    eval_status = trainer_evaluation_status()

    if request.method == "POST":
        if not eval_open:
            messages.error(
                request,
                f"Trainer Evaluation is currently closed. {eval_status.get('message', '')}",
            )
            return redirect("student_trainer_evaluation")

        try:
            from backend.student.services import save_student_trainer_evaluation
            save_student_trainer_evaluation(request.user, request.POST)
            messages.success(request, "Evaluation submitted successfully! Thank you for your feedback.")
        except Exception as exc:
            messages.error(request, f"Could not submit evaluation: {exc}")
        return redirect("/dashboard/student/trainer-evaluation/?tab=history")

    return render(
        request,
        "student/trainer_evaluation.html",
        student_trainer_evaluation_context(request),
    )


@login_required(login_url="/")
def apply_another_program_api(request):
    """
    Allows a graduated/competent student or candidate to enroll or assess in another qualification.
    Maintains their verified baseline documentation and submits the new program application to the Registrar.
    """
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "Invalid request method."}, status=405)

    user = request.user
    from django.utils import timezone
    from backend.student.models import CandidateProfile, StudentProfile, StudentRegistration
    from backend.student.services import student_is_user_graduated
    if not student_is_user_graduated(user):
        return JsonResponse({
            "ok": False,
            "error": "Only students or candidates who have completed a qualification can apply for another program.",
        }, status=400)

    try:
        import json
        if request.content_type and "application/json" in request.content_type:
            data = json.loads(request.body.decode("utf-8"))
        else:
            data = request.POST
    except Exception:
        data = request.POST

    program_type = (data.get("program_type") or "").strip().lower()
    selected_program = (data.get("selected_program") or "").strip()
    preferred_schedule = (data.get("preferred_schedule") or "").strip()

    valid_types = ("assessment_only", "training_with_assessment")
    if program_type not in valid_types:
        return JsonResponse({"ok": False, "error": "Please select a valid application type."}, status=400)

    from backend.system_admin.program_config import enrollment_program_options
    from backend.system_admin.assessments import enrollment_assessment_options
    programs = list(enrollment_program_options())
    assessments = list(enrollment_assessment_options())
    all_allowed = set(programs + assessments)
    if selected_program not in all_allowed:
        return JsonResponse({"ok": False, "error": f"Invalid qualification selected: '{selected_program}'."}, status=400)

    reg = getattr(user, "registration_application", None)
    if not reg:
        return JsonResponse({"ok": False, "error": "Registration record not found."}, status=404)

    # Archive previous completed qualification in profile history
    profile = get_enrollment_profile(user)
    if profile:
        if not isinstance(profile.assessment_application_data, dict):
            profile.assessment_application_data = {}
        history = list(profile.assessment_application_data.get("completed_qualifications", []))
        prev_record = {
            "program": reg.selected_program,
            "program_type": reg.program_type,
            "graduated_at": reg.graduated_at.isoformat() if reg.graduated_at else timezone.now().isoformat(),
            "is_graduated": True,
        }
        if not any(h.get("program") == reg.selected_program for h in history):
            history.append(prev_record)
        profile.assessment_application_data["completed_qualifications"] = history
        profile.selected_program = selected_program
        profile.program_type = program_type
        profile.profile_step_completed = True
        profile.requirements_submitted = False
        profile.documents_review_released = False
        profile.save()

    # Update registration application to the new program for registrar verification
    reg.selected_program = selected_program
    reg.program_type = program_type
    if preferred_schedule:
        reg.preferred_schedule = preferred_schedule
    reg.status = StudentRegistration.Status.PENDING
    reg.is_graduated = False
    reg.graduated_at = None
    reg.save()

    # Ensure profile role
    if program_type == "assessment_only":
        CandidateProfile.objects.get_or_create(user=user)
    else:
        StudentProfile.objects.get_or_create(user=user)

    redirect_url = reverse("student_enrollment_requirements")

    type_label = "National Assessment" if program_type == "assessment_only" else "Training Program"
    messages.info(
        request,
        f"You are applying for {selected_program} ({type_label}). Please review, update, or upload your required documents below.",
    )

    return JsonResponse({
        "ok": True,
        "message": f"Application initiated for {selected_program}! Please review and update your required documents.",
        "redirect_url": redirect_url,
    })