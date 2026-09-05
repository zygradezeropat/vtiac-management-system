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

    if not request_id or not new_status:
        return JsonResponse({"ok": False, "error": "Request ID and Status are required."}, status=400)

    from backend.student.models import StudentDocumentRequest

    try:
        doc_req = StudentDocumentRequest.objects.get(id=request_id)
        if new_status in StudentDocumentRequest.Status.values:
            doc_req.status = new_status
            if remarks:
                doc_req.remarks = remarks
            doc_req.save()
            return JsonResponse({
                "ok": True,
                "message": f"Document request status updated to {doc_req.get_status_display()}.",
                "id": doc_req.id,
                "status": doc_req.status,
                "status_display": doc_req.get_status_display(),
            })
        else:
            return JsonResponse({"ok": False, "error": "Invalid status option."}, status=400)
    except StudentDocumentRequest.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Document request not found."}, status=404)