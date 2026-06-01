"""HTTP endpoints for trainer account approval."""

from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .approval import (
    approve_trainer_request,
    get_pending_trainer_request,
    pending_trainer_requests_count,
    reject_trainer_request,
)
from .approval_access import require_trainer_approval_access


@login_required(login_url="/")
@require_http_methods(["POST"])
def trainer_approval_approve(request):
    denied = require_trainer_approval_access(request)
    if denied:
        return denied

    request_id = request.POST.get("request_id", "").strip()
    req = get_pending_trainer_request(request_id)
    if not req:
        return JsonResponse(
            {"error": "Trainer request not found or already processed."},
            status=404,
        )

    try:
        approve_trainer_request(req)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except IntegrityError:
        return JsonResponse({"error": "Could not create trainer account."}, status=500)

    return JsonResponse(
        {
            "ok": True,
            "request_id": str(req.id),
            "status": req.status,
            "pending_count": pending_trainer_requests_count(),
        }
    )


@login_required(login_url="/")
@require_http_methods(["POST"])
def trainer_approval_reject(request):
    denied = require_trainer_approval_access(request)
    if denied:
        return denied

    request_id = request.POST.get("request_id", "").strip()
    req = get_pending_trainer_request(request_id)
    if not req:
        return JsonResponse(
            {"error": "Trainer request not found or already processed."},
            status=404,
        )

    reject_trainer_request(req)

    return JsonResponse(
        {
            "ok": True,
            "request_id": str(req.id),
            "status": req.status,
            "pending_count": pending_trainer_requests_count(),
        }
    )
