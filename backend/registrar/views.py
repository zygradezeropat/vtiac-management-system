from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.http import JsonResponse
from backend.accounts.services import require_portal_access

from .services import (
    REGISTRAR_ROLE,
    module_page_context,
    module_template,
    normalize_module,
)



@login_required(login_url="/")
def dashboard_redirect(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    
    return redirect("registrar_module", module="dashboard")


@login_required(login_url="/")
def module_page(request, module):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied


    module = normalize_module(module)
    return render(
        request,
        module_template(module),
        module_page_context(module, request),
    )

@login_required
def trainer_evaluations(request):
    return render(
        request,
        "registrar/trainer_evaluations.html",
        {
            "page_title": "Trainer Evaluations",
            "page_subtitle": "Monitor trainer performance.",
        },
    )


@login_required(login_url="/")
def update_document_request_status(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "Invalid request method."}, status=405)

    request_id = request.POST.get("request_id")
    new_status = request.POST.get("status")
    remarks = (request.POST.get("remarks") or "").strip()
    release_date_raw = (request.POST.get("release_date") or "").strip()

    if not request_id or not new_status:
        return JsonResponse({"ok": False, "error": "Request ID and Status are required."}, status=400)

    from backend.student.models import StudentDocumentRequest
    from backend.core.notification_service import create_notification
    from backend.core.models import PortalNotification
    from datetime import datetime

    try:
        doc_req = StudentDocumentRequest.objects.get(id=request_id)
        if new_status in StudentDocumentRequest.Status.values:
            doc_req.status = new_status
            doc_req.remarks = remarks

            if release_date_raw:
                try:
                    doc_req.release_date = datetime.strptime(release_date_raw, "%Y-%m-%d").date()
                except ValueError:
                    pass

            doc_req.save()

            # Create notification for student
            if doc_req.user:
                if new_status in ("ready", "completed"):
                    date_str = doc_req.release_date.strftime("%B %d, %Y") if doc_req.release_date else "soon"
                    create_notification(
                        doc_req.user,
                        category=PortalNotification.Category.DOCUMENTS_RELEASED,
                        title="Document Ready for Pick-Up",
                        message=f"Your requested document '{doc_req.document_name}' is ready! Pick-up / Claim Date: {date_str}.",
                        link_url="/dashboard/student/documents/",
                        related_profile_id=doc_req.profile_id,
                    )
                elif new_status == "processing":
                    create_notification(
                        doc_req.user,
                        category=PortalNotification.Category.DOCUMENT_APPROVED,
                        title="Document Request Processing",
                        message=f"Your request for '{doc_req.document_name}' is now being processed by the Registrar.",
                        link_url="/dashboard/student/documents/",
                        related_profile_id=doc_req.profile_id,
                    )
                elif new_status == "rejected":
                    msg = f"Your request for '{doc_req.document_name}' was not approved."
                    if doc_req.remarks:
                        msg += f" Reason: {doc_req.remarks}"
                    create_notification(
                        doc_req.user,
                        category=PortalNotification.Category.DOCUMENT_REJECTED,
                        title="Document Request Update",
                        message=msg,
                        link_url="/dashboard/student/documents/",
                        related_profile_id=doc_req.profile_id,
                    )

            return JsonResponse({
                "ok": True,
                "message": f"Document request status updated to {doc_req.get_status_display()}.",
                "id": doc_req.id,
                "status": doc_req.status,
                "status_display": doc_req.get_status_display(),
                "release_date": doc_req.release_date.strftime("%B %d, %Y") if doc_req.release_date else "",
            })
        else:
            return JsonResponse({"ok": False, "error": "Invalid status option."}, status=400)
    except StudentDocumentRequest.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Document request not found."}, status=404)