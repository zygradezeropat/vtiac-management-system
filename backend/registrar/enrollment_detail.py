"""Learner profile detail for registrar enrollment view modal."""

import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from backend.accounts.services import require_portal_access
from backend.student.document_review import (
    all_reviewable_documents_approved,
    get_document_review_status,
)
from backend.student.enrollment_requirements import ID_TYPE_CHOICES, REQUIREMENT_SPECS
from backend.student.models import (
    StudentEnrollmentDocument,
    StudentEnrollmentProfile,
    StudentRegistration,
)
from backend.student.services import (
    CLIENT_CLASSIFICATIONS,
    DISABILITY_CAUSES,
    DISABILITY_TYPES,
    EMPLOYMENT_STATUS_CHOICES,
    EMPLOYMENT_TYPE_CHOICES,
    EDUCATIONAL_ATTAINMENT_CHOICES,
    SCHOLARSHIP_TYPE_CHOICES,
    _enrollment_form_initial_from_profile,
    _enrollment_form_initial_from_registration,
)

from .pending_enrollment import _profile_for_registration, _registration_for_profile
from .services import REGISTRAR_ROLE

_CHOICE_MAPS = {
    "civil_status": dict(StudentRegistration.CivilStatus.choices),
    "employment_status": dict(EMPLOYMENT_STATUS_CHOICES),
    "employment_type": dict(EMPLOYMENT_TYPE_CHOICES),
    "educational_attainment": dict(EDUCATIONAL_ATTAINMENT_CHOICES),
    "scholarship_type": dict(SCHOLARSHIP_TYPE_CHOICES),
    "sex": dict(StudentRegistration.Gender.choices),
    "program_type": dict(StudentRegistration.ProgramType.choices),
}

_ADDRESS_CACHE = None


def _load_address_data():
    global _ADDRESS_CACHE
    if _ADDRESS_CACHE is not None:
        return _ADDRESS_CACHE
    base = Path(settings.BASE_DIR) / "static" / "data" / "address"
    _ADDRESS_CACHE = {
        "regions": json.loads((base / "region.json").read_text(encoding="utf-8")),
        "provinces": json.loads((base / "province.json").read_text(encoding="utf-8")),
        "cities": json.loads((base / "city.json").read_text(encoding="utf-8")),
        "barangays": json.loads((base / "barangay.json").read_text(encoding="utf-8")),
    }
    return _ADDRESS_CACHE


def _resolve_address_labels(region_code, province_code, city_code, barangay_code):
    data = _load_address_data()
    region = next((r for r in data["regions"] if r.get("region_code") == region_code), None)
    province = next((p for p in data["provinces"] if p.get("province_code") == province_code), None)
    city = next((c for c in data["cities"] if c.get("city_code") == city_code), None)
    barangay = next((b for b in data["barangays"] if b.get("brgy_code") == barangay_code), None)
    return {
        "region": region.get("region_name", region_code or "—") if region else (region_code or "—"),
        "province": province.get("province_name", province_code or "—") if province else (province_code or "—"),
        "city": city.get("city_name", city_code or "—") if city else (city_code or "—"),
        "barangay": barangay.get("brgy_name", barangay_code or "—") if barangay else (barangay_code or "—"),
    }


def _label(field: str, value: str) -> str:
    if not value:
        return "—"
    return _CHOICE_MAPS.get(field, {}).get(value, value.replace("_", " ").title())


def _id_type_label(id_type: str) -> str:
    if not id_type:
        return ""
    return dict(ID_TYPE_CHOICES).get(id_type, id_type.replace("_", " ").title())


def _doc_review_fields(profile: StudentEnrollmentProfile, document_key: str) -> dict:
    status = get_document_review_status(profile, document_key)
    rejection = ""
    if document_key == "profile_photo":
        rejection = (profile.photo_rejection_reason or "").strip()
    else:
        doc = profile.documents.filter(document_type=document_key).first()
        if doc:
            rejection = (doc.rejection_reason or "").strip()
    return {"reviewStatus": status, "rejectionReason": rejection, "reviewable": True}


def _build_review_documents(profile: StudentEnrollmentProfile | None) -> list:
    """Enrollment files registrar must approve before the student may pay."""
    if not profile:
        return []

    items = []
    doc_by_type = {d.document_type: d for d in profile.documents.all()}

    if profile.photo:
        items.append(
            {
                "key": "profile_photo",
                "title": "1×1 Photo (Learner Profile)",
                "filename": profile.photo.name.split("/")[-1],
                "fileUrl": profile.photo.url,
                "subtitle": "",
                "uploadedAt": "",
                **_doc_review_fields(profile, "profile_photo"),
            }
        )

    for spec in REQUIREMENT_SPECS:
        doc = doc_by_type.get(spec["key"])
        if not doc or not doc.file:
            continue
        subtitle = ""
        if spec["key"] == StudentEnrollmentDocument.DocumentType.VALID_ID and doc.id_type:
            subtitle = _id_type_label(doc.id_type)
        items.append(
            {
                "key": spec["key"],
                "title": spec["title"],
                "filename": doc.original_filename or doc.file.name.split("/")[-1],
                "fileUrl": doc.file.url,
                "subtitle": subtitle,
                "uploadedAt": timezone.localtime(doc.uploaded_at).strftime("%b %d, %Y"),
                **_doc_review_fields(profile, spec["key"]),
            }
        )

    return items


def _build_payment_documents(profile: StudentEnrollmentProfile | None) -> list:
    if not profile:
        return []
    items = []
    for proof in profile.payment_proofs.order_by("-uploaded_at"):
        if not proof.file:
            continue
        ref = (proof.reference_note or "").strip()
        items.append(
            {
                "key": f"payment_{proof.pk}",
                "title": "Proof of Payment",
                "filename": proof.original_filename or proof.file.name.split("/")[-1],
                "fileUrl": proof.file.url,
                "subtitle": f"Ref: {ref}" if ref else "",
                "uploadedAt": timezone.localtime(proof.uploaded_at).strftime("%b %d, %Y"),
                "reviewable": False,
            }
        )
    return items


def _format_date(iso_value: str) -> str:
    if not iso_value:
        return "—"
    try:
        from datetime import date

        if len(iso_value) >= 10:
            d = date.fromisoformat(iso_value[:10])
            return d.strftime("%m/%d/%Y")
    except ValueError:
        pass
    return iso_value


def build_learner_profile_detail(profile: StudentEnrollmentProfile | None, reg: StudentRegistration | None):
    if profile and profile.profile_step_completed:
        initial = _enrollment_form_initial_from_profile(profile)
        source = "profile"
        entry_date = profile.entry_date.strftime("%m/%d/%y") if profile.entry_date else "—"
        tsmis = profile.tsmis or initial.get("reference_id") or "—"
        photo_url = profile.photo.url if profile.photo else ""
        noted_by = profile.noted_by or ""
        date_received = _format_date(initial.get("date_received") or "")
    elif reg:
        initial = _enrollment_form_initial_from_registration(reg)
        source = "registration"
        entry_date = reg.created_at.strftime("%m/%d/%y") if reg.created_at else "—"
        tsmis = reg.reference_id or "—"
        photo_url = ""
        noted_by = ""
        date_received = ""
    else:
        return {"error": "No enrollment record found."}

    program_type = initial.get("program_type") or StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT
    is_training = program_type == StudentRegistration.ProgramType.TRAINING_WITH_ASSESSMENT

    addr = _resolve_address_labels(
        initial.get("region_code", ""),
        initial.get("province_code", ""),
        initial.get("city_code", ""),
        initial.get("barangay_code", ""),
    )

    last = initial.get("last_name") or ""
    ext = initial.get("name_extension")
    last_display = f"{last}{', ' + ext if ext else ''}"
    full_name = " ".join(
        p
        for p in [initial.get("first_name"), initial.get("middle_name"), last_display]
        if p
    ).strip()

    return {
        "source": source,
        "formType": "training" if is_training else "assessment_only",
        "referenceId": reg.reference_id if reg else initial.get("reference_id", ""),
        "name": full_name or "—",
        "email": initial.get("email", "—"),
        "program": initial.get("program_name", "—"),
        "programTypeLabel": initial.get("program_type_label", ""),
        "neededLabel": None,
        "section1": {
            "tsmis": tsmis,
            "uli": initial.get("uli") or "—",
            "entryDate": entry_date,
        },
        "section2": {
            "lastName": initial.get("last_name", "—"),
            "firstName": initial.get("first_name", "—"),
            "middleName": initial.get("middle_name") or "—",
            "nameExtension": initial.get("name_extension") or "—",
            "street": initial.get("street_house") or "—",
            "district": initial.get("district") or "—",
            "barangay": addr["barangay"],
            "city": addr["city"],
            "province": addr["province"],
            "region": addr["region"],
            "email": initial.get("email", "—"),
            "contact": initial.get("contact_number", "—"),
            "nationality": initial.get("nationality") or "Filipino",
        },
        "section3": {
            "sex": _label("sex", initial.get("sex", "")),
            "civilStatus": _label("civil_status", initial.get("civil_status", "")),
            "employmentStatus": _label("employment_status", initial.get("employment_status", "")),
            "employmentType": _label("employment_type", initial.get("employment_type", "")),
            "birthDate": _format_date(initial.get("birth_date", "")),
            "birthplace": initial.get("birthplace") or "—",
            "education": _label("educational_attainment", initial.get("educational_attainment", "")),
            "guardianName": initial.get("parent_guardian_name") or "—",
            "guardianAddress": initial.get("parent_guardian_address") or "—",
        },
        "section4": {
            "options": list(CLIENT_CLASSIFICATIONS),
            "selected": list(initial.get("selected_classifications") or []),
        },
        "section5": {
            "options": list(DISABILITY_TYPES),
            "selected": list(initial.get("selected_disability_types") or []),
            "otherSpecify": initial.get("disability_other_specify") or "",
        },
        "section6": {
            "options": list(DISABILITY_CAUSES),
            "selected": list(initial.get("selected_disability_causes") or []),
        },
        "section7": {
            "course": initial.get("program_name", "—"),
        },
        "section8": {
            "scholarship": _label("scholarship_type", initial.get("scholarship_type", "")),
        },
        "section9": {
            "privacyConsent": bool(initial.get("privacy_consent")),
        },
        "section10": {
            "signature": initial.get("signature") or "—",
            "dateAccomplished": _format_date(initial.get("date_accomplished", "")),
            "notedBy": noted_by or "—",
            "dateReceived": date_received,
            "photoUrl": photo_url,
        },
        "uploadedDocuments": _build_review_documents(profile),
        "paymentDocuments": _build_payment_documents(profile),
        "allDocumentsApproved": all_reviewable_documents_approved(profile) if profile else False,
        "documentsReviewReleased": bool(profile and profile.documents_review_released),
    }


@login_required(login_url="/")
@require_http_methods(["GET"])
def enrollment_detail(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return denied

    profile_id = request.GET.get("profile_id")
    registration_id = request.GET.get("registration_id")

    profile = None
    reg = None

    if profile_id:
        try:
            profile = (
                StudentEnrollmentProfile.objects.select_related("user", "registration")
                .prefetch_related("documents", "payment_proofs")
                .get(pk=int(profile_id))
            )
        except (StudentEnrollmentProfile.DoesNotExist, ValueError):
            return JsonResponse({"error": "Profile not found."}, status=404)
        reg = _registration_for_profile(profile)

    elif registration_id:
        try:
            reg = StudentRegistration.objects.select_related("user").get(pk=registration_id)
        except (StudentRegistration.DoesNotExist, ValueError):
            return JsonResponse({"error": "Registration not found."}, status=404)
        profile = _profile_for_registration(reg)
        if profile:
            profile = (
                StudentEnrollmentProfile.objects.select_related("user", "registration")
                .prefetch_related("documents", "payment_proofs")
                .filter(pk=profile.pk)
                .first()
            )
    else:
        return JsonResponse({"error": "profile_id or registration_id is required."}, status=400)

    payload = build_learner_profile_detail(profile, reg)
    if payload.get("error"):
        return JsonResponse(payload, status=404)
    return JsonResponse(payload)
