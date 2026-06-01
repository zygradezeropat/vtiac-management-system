from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_POST

from backend.accounts.services import require_portal_access
from backend.core.staff_settings import (
    change_staff_password,
    parse_profile_post,
    update_staff_profile,
    validate_password_change,
    validate_profile_data,
)

from .services import (
    PROGRAM_QUALIFICATIONS,
    TRAINER_ROLE,
    create_trainer_account_request,
    module_page_context,
    module_template,
    normalize_module,
    parse_trainer_request_post,
    validate_trainer_request_data,
)
from .grading_api import (
    list_trainer_grade_records,
    parse_grade_post_body,
    save_trainer_student_grade,
)


def trainer_request(request):
    reference_id = request.session.pop("trainer_request_reference_id", None)

    if request.method == "POST":
        data = parse_trainer_request_post(request.POST)
        errors = validate_trainer_request_data(data)

        if errors:
            for msg in errors:
                messages.error(request, msg)
            return redirect("trainer_request")

        try:
            registration = create_trainer_account_request(data)
        except Exception as exc:
            messages.error(request, f"Could not submit request: {exc}")
            return redirect("trainer_request")

        request.session["trainer_request_reference_id"] = registration.reference_id
        messages.success(
            request,
            "Your trainer account request was submitted. The registrar will review it.",
        )
        return redirect("trainer_request")

    return render(
        request,
        "auth/trainer_request.html",
        {
            "program_qualifications": PROGRAM_QUALIFICATIONS,
            "reference_id": reference_id,
            "show_confirmation": bool(reference_id),
        },
    )


@login_required(login_url="/")
def dashboard(request):
    return module_page(request, "dashboard")


@login_required(login_url="/")
def module_page(request, module):
    denied = require_portal_access(request, TRAINER_ROLE)
    if denied:
        return denied

    module = normalize_module(module)
    return render(
        request,
        module_template(module),
        module_page_context(module, request),
    )


@login_required(login_url="/")
@require_POST
def settings_profile_api(request):
    denied = require_portal_access(request, TRAINER_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

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

    display_name = f"{profile['first_name']} {profile['last_name']}".strip()
    parts = display_name.split()
    initials = (
        f"{parts[0][0]}{parts[-1][0]}".upper()
        if len(parts) >= 2
        else display_name[:2].upper()
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
def settings_password_api(request):
    denied = require_portal_access(request, TRAINER_ROLE)
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

    return JsonResponse(
        {
            "ok": True,
            "message": "Password updated successfully.",
        }
    )


@login_required(login_url="/")
@require_POST
def grading_save_api(request):
    denied = require_portal_access(request, TRAINER_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    try:
        data = parse_grade_post_body(request)
        record = save_trainer_student_grade(request.user, data)
    except ValueError as exc:
        return JsonResponse({"ok": False, "message": str(exc)}, status=400)
    except Exception as exc:
        return JsonResponse(
            {"ok": False, "message": f"Could not save grades: {exc}"},
            status=500,
        )

    return JsonResponse(
        {
            "ok": True,
            "message": f"Grades for {record.student_name} saved successfully.",
            "student_key": record.student_key,
            "updated_at": record.updated_at.isoformat(),
        }
    )


@login_required(login_url="/")
@require_GET
def grading_records_api(request):
    denied = require_portal_access(request, TRAINER_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    records = list_trainer_grade_records(request.user)
    return JsonResponse({"ok": True, "records": records})
