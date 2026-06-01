"""Serve student issued documents (view / download)."""

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import redirect, render
from django.utils import timezone

from backend.accounts.services import require_portal_access

from .payments import payment_statement
from .services import STUDENT_ROLE, get_enrollment_profile
from .student_documents import document_available, student_documents_context


def _registration(request):
    return getattr(request.user, "registration_application", None)


def _require_document(request, doc_key, *, for_download=False):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied, None, None, None

    profile = get_enrollment_profile(request.user)
    registration = _registration(request)
    row = document_available(profile, registration, doc_key)
    if not row:
        raise Http404("Document not found.")

    if for_download and not row["can_download"]:
        messages.warning(request, f"{row['title']} is not available for download yet.")
        return redirect("student_documents"), None, None, None

    if not for_download and not row["can_view"]:
        messages.warning(request, f"{row['title']} is not available to view yet.")
        return redirect("student_documents"), None, None, None

    return None, profile, registration, row


@login_required(login_url="/")
def documents(request):
    denied = require_portal_access(request, STUDENT_ROLE)
    if denied:
        return denied
    return render(request, "student/documents.html", student_documents_context(request))


@login_required(login_url="/")
def document_view(request, doc_key):
    redirect_resp, profile, registration, row = _require_document(request, doc_key)
    if redirect_resp:
        return redirect_resp

    now = timezone.localtime()
    ctx = {
        "profile": profile,
        "generated_at": now.strftime("%B %d, %Y"),
        "date_display": now.strftime("%B %d, %Y"),
        "year": now.year,
    }

    if doc_key == "profile_form":
        return render(request, "student/document_profile.html", ctx)

    if doc_key == "official_receipt":
        statement = payment_statement(profile)
        ctx["total_display"] = statement["total_display"]
        return render(request, "student/document_receipt.html", ctx)

    if doc_key == "confirmation_slip":
        return render(request, "student/document_confirmation_slip.html", ctx)

    if doc_key == "student_handbook":
        return render(request, "student/document_handbook.html", ctx)

    raise Http404("Document not found.")


@login_required(login_url="/")
def document_download(request, doc_key):
    redirect_resp, profile, registration, row = _require_document(
        request, doc_key, for_download=True
    )
    if redirect_resp:
        return redirect_resp

    if doc_key == "student_handbook":
        from django.conf import settings
        from pathlib import Path

        path = Path(settings.BASE_DIR) / "static" / "docs" / "student-handbook.pdf"
        if path.is_file():
            return FileResponse(path.open("rb"), as_attachment=True, filename="VTIAC-Student-Handbook.pdf")
        return _html_download(
            request,
            "student/document_handbook.html",
            {"profile": profile, "date_display": timezone.localdate().strftime("%B %d, %Y")},
            filename="VTIAC-Student-Handbook.html",
        )

    templates = {
        "profile_form": ("student/document_profile.html", "Learners-Profile-Form.html"),
        "official_receipt": ("student/document_receipt.html", "Official-Receipt.html"),
        "confirmation_slip": (
            "student/document_confirmation_slip.html",
            "Confirmation-Slip.html",
        ),
    }
    pair = templates.get(doc_key)
    if not pair:
        raise Http404("Document not found.")

    template_name, filename = pair
    now = timezone.localtime()
    ctx = {
        "profile": profile,
        "generated_at": now.strftime("%B %d, %Y"),
        "date_display": now.strftime("%B %d, %Y"),
        "year": now.year,
        "total_display": payment_statement(profile)["total_display"],
    }
    return _html_download(request, template_name, ctx, filename=filename)


def _html_download(request, template_name, context, filename):
    html = render(request, template_name, context).content
    response = HttpResponse(html, content_type="text/html; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
