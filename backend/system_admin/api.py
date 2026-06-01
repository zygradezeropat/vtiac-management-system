"""System admin JSON API."""

import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from backend.accounts.services import require_portal_access

from .programs import (
    create_program,
    system_settings_payload,
    update_program,
    update_system_settings,
)
from .services import ADMIN_ROLE
from .user_management import create_user, list_users, reset_user_password, update_user


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return None


def _admin_access(request):
    denied = require_portal_access(request, ADMIN_ROLE)
    if denied:
        return denied
    return None


@login_required(login_url="/")
@require_GET
def users_list(request):
    denied = _admin_access(request)
    if denied:
        return denied

    result = list_users(
        search=request.GET.get("q", ""),
        account_type=request.GET.get("account_type", ""),
        role=request.GET.get("role", ""),
        page=request.GET.get("page", 1),
    )
    return JsonResponse(result)


@login_required(login_url="/")
@require_http_methods(["POST"])
def users_create(request):
    denied = _admin_access(request)
    if denied:
        return denied

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    try:
        user = create_user(
            account_type=data.get("account_type"),
            email=data.get("email"),
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
            password=data.get("password"),
            role=data.get("role"),
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True, "user": user}, status=201)


@login_required(login_url="/")
@require_http_methods(["PATCH", "PUT"])
def users_update(request, user_id):
    denied = _admin_access(request)
    if denied:
        return denied

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    if user_id == request.user.id and data.get("is_active") is False:
        return JsonResponse({"error": "You cannot deactivate your own account."}, status=400)

    try:
        user = update_user(
            user_id,
            email=data.get("email"),
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
            role=data.get("role"),
            is_active=data.get("is_active"),
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True, "user": user})


@login_required(login_url="/")
@require_http_methods(["POST"])
def users_reset_password(request, user_id):
    denied = _admin_access(request)
    if denied:
        return denied

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    try:
        reset_user_password(user_id, data.get("password"))
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True})


@login_required(login_url="/")
@require_GET
def system_settings_get(request):
    denied = _admin_access(request)
    if denied:
        return denied
    return JsonResponse(system_settings_payload())


@login_required(login_url="/")
@require_http_methods(["PATCH", "PUT"])
def system_settings_update(request):
    denied = _admin_access(request)
    if denied:
        return denied

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    try:
        settings = update_system_settings(
            fiscal_year_label=data.get("fiscal_year_label"),
            registration_fee=data.get("registration_fee"),
            enrollment_open=data.get("enrollment_open"),
            user=request.user,
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True, "settings": settings})


@login_required(login_url="/")
@require_http_methods(["POST"])
def programs_create(request):
    denied = _admin_access(request)
    if denied:
        return denied

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    try:
        program = create_program(
            name=data.get("name"),
            training_fee=data.get("training_fee"),
            sort_order=data.get("sort_order"),
            is_active=data.get("is_active", True),
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True, "program": program}, status=201)


@login_required(login_url="/")
@require_http_methods(["PATCH", "PUT"])
def programs_update(request, program_id):
    denied = _admin_access(request)
    if denied:
        return denied

    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    try:
        program = update_program(
            program_id,
            name=data.get("name"),
            training_fee=data.get("training_fee"),
            sort_order=data.get("sort_order"),
            is_active=data.get("is_active"),
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True, "program": program})
