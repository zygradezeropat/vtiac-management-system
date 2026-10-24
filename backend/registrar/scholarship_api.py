"""API endpoint to apply parsed scholarship records directly to student database profiles."""

from __future__ import annotations

import datetime
import json
from django.contrib.auth.decorators import login_required
from django.db import models
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from backend.accounts.services import require_portal_access
from backend.student.models import StudentEnrollmentProfile, StudentRegistration
from .models import ScholarGrantRecord, ScholarshipGrantBatch
from .pending_enrollment import _profile_for_registration
from .services import REGISTRAR_ROLE


def sync_unlinked_scholar_grants() -> int:
    """Auto-scan unlinked ScholarGrantRecord database rows and link them to StudentEnrollmentProfile or approved StudentRegistration records."""
    unlinked_grants = ScholarGrantRecord.objects.filter(models.Q(profile__isnull=True) | models.Q(registration__isnull=True))
    if not unlinked_grants.exists():
        return 0

    synced_count = 0
    for grant in unlinked_grants:
        email = (grant.email or "").strip()
        last_name = (grant.last_name or "").strip()
        first_name = (grant.first_name or "").strip()
        scholar_name = (grant.scholar_name or "").strip()

        target_type = grant.scholarship_type or "tesda"
        profile = grant.profile
        reg = grant.registration

        # 1. Search existing StudentEnrollmentProfile
        if not profile and email:
            profile = StudentEnrollmentProfile.objects.filter(email__iexact=email).first()

        if not profile and (last_name or first_name or scholar_name):
            clean_last = last_name
            clean_first = first_name
            if not clean_last and not clean_first and scholar_name:
                parts = scholar_name.replace(",", " ").split()
                if len(parts) >= 2:
                    clean_first = parts[0]
                    clean_last = parts[-1]

            qs = StudentEnrollmentProfile.objects.all()
            if clean_last:
                qs = qs.filter(last_name__iexact=clean_last)
            if clean_first:
                qs = qs.filter(first_name__icontains=clean_first)
            profile = qs.first()

        # 2. Search approved StudentRegistration
        if not reg:
            reg_qs = StudentRegistration.objects.filter(status=StudentRegistration.Status.APPROVED)
            if email:
                reg = reg_qs.filter(email__iexact=email).first()
            if not reg and (last_name or first_name or scholar_name):
                clean_last = last_name
                clean_first = first_name
                if not clean_last and not clean_first and scholar_name:
                    parts = scholar_name.replace(",", " ").split()
                    if len(parts) >= 2:
                        clean_first = parts[0]
                        clean_last = parts[-1]

                if clean_last:
                    reg_qs = reg_qs.filter(last_name__iexact=clean_last)
                if clean_first:
                    reg_qs = reg_qs.filter(first_name__icontains=clean_first)
                reg = reg_qs.first()

        # If profile not found, check if reg has a profile
        if not profile and reg:
            profile = _profile_for_registration(reg)

        updated_fields = []
        if profile and grant.profile != profile:
            grant.profile = profile
            updated_fields.append("profile")

        if reg and grant.registration != reg:
            grant.registration = reg
            updated_fields.append("registration")

        if profile and profile.registration and grant.registration != profile.registration:
            grant.registration = profile.registration
            if "registration" not in updated_fields:
                updated_fields.append("registration")

        if updated_fields:
            grant.save(update_fields=updated_fields)

        if profile:
            if profile.scholarship_type != target_type:
                profile.scholarship_type = target_type
                profile.save(update_fields=["scholarship_type"])

        if updated_fields or profile:
            synced_count += 1

    return synced_count


@login_required(login_url="/")
@require_POST
def scholarship_integrate_records(request):
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "message": "Invalid JSON payload."}, status=400)

    scholars = body.get("scholars", [])
    sponsor = (body.get("sponsor") or "").strip()
    filename = (body.get("filename") or "").strip()
    total_parsed_rows = body.get("totalParsedRows", len(scholars))

    if not isinstance(scholars, list) or not scholars:
        return JsonResponse({"ok": False, "message": "No scholars provided for import."}, status=400)

    batch = ScholarshipGrantBatch.objects.create(
        sponsor_name=sponsor or "Scholarship Grant",
        filename=filename,
        total_parsed_rows=total_parsed_rows if isinstance(total_parsed_rows, int) else len(scholars),
        matched_count=len(scholars),
        uploaded_by=request.user if request.user.is_authenticated else None,
    )

    updated_count = 0
    updated_records = []

    for item in scholars:
        registration_id = item.get("registrationId")
        profile_id = item.get("profileId")
        row_no = item.get("no") or item.get("idNo") or ""
        first_name = (item.get("firstName") or "").strip()
        last_name = (item.get("lastName") or "").strip()
        middle_name = (item.get("middleName") or "").strip()
        scholar_name = (item.get("scholarName") or "").strip()
        birthdate = (item.get("birthDate") or item.get("birthdate") or "").strip()
        address = (item.get("address") or "").strip()
        email = (item.get("email") or "").strip()
        program = (item.get("program") or "").strip()
        slot_id = (item.get("slotId") or "").strip()
        amount = (item.get("amount") or "").strip()
        scholarship_type = (item.get("scholarshipType") or "tesda").strip()

        # Parse Excel numeric serial date if birthdate is serial number (e.g. 36661 or 36661-01-01)
        if birthdate.endswith("-01-01") and birthdate.split("-")[0].isdigit():
            birthdate = birthdate.split("-")[0]
        if birthdate.isdigit() and 10000 <= int(birthdate) <= 60000:
            d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(birthdate))
            birthdate = d.strftime("%Y-%m-%d")

        reg = None
        if registration_id:
            reg = StudentRegistration.objects.filter(
                pk=registration_id,
                status=StudentRegistration.Status.APPROVED,
            ).first()

        profile = None
        if profile_id:
            profile = StudentEnrollmentProfile.objects.filter(pk=profile_id).first()
        elif reg:
            profile = _profile_for_registration(reg)

        # Fallback server-side student matching if profile was not resolved on frontend
        if not profile:
            if email:
                profile = StudentEnrollmentProfile.objects.filter(email__iexact=email).first()

            if not profile and (last_name or first_name or scholar_name):
                clean_last = last_name
                clean_first = first_name

                if not clean_last and not clean_first and scholar_name:
                    parts = scholar_name.replace(",", " ").split()
                    if len(parts) >= 2:
                        clean_first = parts[0]
                        clean_last = parts[-1]

                profiles_qs = StudentEnrollmentProfile.objects.all()
                if clean_last:
                    profiles_qs = profiles_qs.filter(last_name__iexact=clean_last)
                if clean_first:
                    profiles_qs = profiles_qs.filter(first_name__icontains=clean_first)

                matched_profile = profiles_qs.first()
                if matched_profile:
                    profile = matched_profile

        # Fallback to approved registration application if profile does not exist yet
        if not reg and (email or last_name or first_name or scholar_name):
            reg_qs = StudentRegistration.objects.filter(status=StudentRegistration.Status.APPROVED)
            if email:
                reg = reg_qs.filter(email__iexact=email).first()
            if not reg and (last_name or first_name):
                clean_last = last_name
                clean_first = first_name
                if clean_last:
                    reg_qs = reg_qs.filter(last_name__iexact=clean_last)
                if clean_first:
                    reg_qs = reg_qs.filter(first_name__icontains=clean_first)
                reg = reg_qs.first()

        if profile:
            profile.scholarship_type = scholarship_type
            profile.save(update_fields=["scholarship_type"])

        full_display_name = (
            scholar_name.replace(",", "")
            or f"{first_name} {middle_name} {last_name}".strip()
            or (f"{profile.first_name} {profile.last_name}" if profile else "Scholar Record")
        )

        # Deduplication check: check if ScholarGrantRecord already exists for this scholar
        grant = None
        if profile:
            grant = ScholarGrantRecord.objects.filter(profile=profile, is_active=True).first()
        if not grant and reg:
            grant = ScholarGrantRecord.objects.filter(registration=reg, is_active=True).first()
        if not grant and email:
            grant = ScholarGrantRecord.objects.filter(email__iexact=email, is_active=True).first()
        if not grant and last_name and first_name:
            grant = ScholarGrantRecord.objects.filter(
                last_name__iexact=last_name,
                first_name__iexact=first_name,
                is_active=True,
            ).first()

        if grant:
            # Update existing grant record instead of creating duplicate
            grant.batch = batch
            if profile:
                grant.profile = profile
            if reg or (profile and profile.registration):
                grant.registration = reg or profile.registration
            if row_no:
                grant.no = str(row_no)
            if first_name:
                grant.first_name = first_name
            if last_name:
                grant.last_name = last_name
            if middle_name:
                grant.middle_name = middle_name
            if full_display_name:
                grant.scholar_name = full_display_name
            if birthdate:
                grant.birthdate = str(birthdate)
            if address:
                grant.address = address
            if email:
                grant.email = email
            if program:
                grant.program = program
            if sponsor:
                grant.sponsor_name = sponsor
            if slot_id:
                grant.slot_id = str(slot_id)
            if amount:
                grant.amount = str(amount)
            if scholarship_type:
                grant.scholarship_type = scholarship_type
            grant.save()
        else:
            # Create new grant record if not existing
            grant = ScholarGrantRecord.objects.create(
                batch=batch,
                profile=profile,
                registration=reg or (profile.registration if profile else None),
                no=str(row_no) if row_no else None,
                first_name=first_name or (profile.first_name if profile else (reg.first_name if reg else None)),
                last_name=last_name or (profile.last_name if profile else (reg.last_name if reg else None)),
                middle_name=middle_name or (profile.middle_name if profile else (reg.middle_name if reg else None)),
                scholar_name=full_display_name,
                birthdate=str(birthdate) if birthdate else (str(profile.birth_date) if profile and profile.birth_date else None),
                address=address or (profile.street_address if profile else None),
                email=email or (profile.email if profile else (reg.email if reg else None)),
                program=program or (profile.selected_program if profile else (reg.selected_program if reg else None)),
                sponsor_name=sponsor or "Scholarship Grant",
                slot_id=str(slot_id) if slot_id else None,
                amount=str(amount) if amount else None,
                scholarship_type=scholarship_type,
            )

        updated_count += 1
        updated_records.append(str(grant.pk))

    return JsonResponse({
        "ok": True,
        "batchId": str(batch.pk),
        "updatedCount": updated_count,
        "message": f"Successfully processed {updated_count} scholar record(s).",
    })


@login_required(login_url="/")
@require_POST
def scholarship_manual_entry(request):
    """Direct manual registration or update of a scholar record without file upload."""
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "message": "Invalid JSON payload."}, status=400)

    record_id = (body.get("recordId") or "").strip()
    registration_id = (body.get("registrationId") or "").strip()
    profile_id = body.get("profileId")
    scholar_name = (body.get("scholarName") or "").strip()
    first_name = (body.get("firstName") or "").strip()
    last_name = (body.get("lastName") or "").strip()
    middle_name = (body.get("middleName") or "").strip()
    email = (body.get("email") or "").strip()
    program = (body.get("program") or "").strip()
    scholarship_type = (body.get("scholarshipType") or "tesda").strip()
    sponsor_name = (body.get("sponsorName") or "").strip()
    academic_year = (body.get("academicYear") or "AY 2026–2027").strip()
    slot_id = (body.get("slotId") or "").strip()
    amount = (body.get("amount") or "").strip()
    address = (body.get("address") or "").strip()
    birthdate = (body.get("birthDate") or "").strip()

    if not scholar_name and not (first_name or last_name):
        return JsonResponse({"ok": False, "message": "Scholar name is required."}, status=400)

    if not scholar_name:
        scholar_name = f"{first_name} {last_name}".strip()

    # Resolve StudentRegistration and StudentEnrollmentProfile
    reg = None
    if registration_id:
        reg = StudentRegistration.objects.filter(pk=registration_id).first()

    profile = None
    if profile_id:
        profile = StudentEnrollmentProfile.objects.filter(pk=profile_id).first()
    elif reg:
        profile = _profile_for_registration(reg)

    if not profile and email:
        profile = StudentEnrollmentProfile.objects.filter(email__iexact=email).first()

    if not reg and profile and profile.registration_id:
        reg = profile.registration

    # If first_name / last_name not provided separately, parse from scholar_name
    if not first_name and not last_name and scholar_name:
        parts = scholar_name.replace(",", " ").split()
        if len(parts) >= 2:
            first_name = parts[0]
            last_name = parts[-1]
            if len(parts) > 2:
                middle_name = " ".join(parts[1:-1])

    grant = None
    if record_id:
        grant = ScholarGrantRecord.objects.filter(pk=record_id).first()

    if not grant and profile:
        grant = ScholarGrantRecord.objects.filter(profile=profile, is_active=True).first()

    if not grant:
        grant = ScholarGrantRecord(
            scholar_name=scholar_name,
            first_name=first_name,
            last_name=last_name,
            middle_name=middle_name,
            email=email or (profile.email if profile else (reg.email if reg else None)),
            program=program or (profile.selected_program if profile else (reg.selected_program if reg else None)),
            scholarship_type=scholarship_type,
            sponsor_name=sponsor_name or "Scholarship Grant",
            academic_year=academic_year,
            slot_id=slot_id or None,
            amount=amount or None,
            address=address or (profile.street_address if profile else None),
            birthdate=birthdate or (str(profile.birth_date) if profile and profile.birth_date else None),
            profile=profile,
            registration=reg,
            is_active=True,
        )
    else:
        grant.scholar_name = scholar_name
        if first_name:
            grant.first_name = first_name
        if last_name:
            grant.last_name = last_name
        if middle_name:
            grant.middle_name = middle_name
        if email:
            grant.email = email
        if program:
            grant.program = program
        grant.scholarship_type = scholarship_type
        grant.sponsor_name = sponsor_name or grant.sponsor_name or "Scholarship Grant"
        grant.academic_year = academic_year
        grant.slot_id = slot_id or grant.slot_id
        grant.amount = amount or grant.amount
        if address:
            grant.address = address
        if birthdate:
            grant.birthdate = birthdate
        if profile:
            grant.profile = profile
        if reg:
            grant.registration = reg
        grant.is_active = True

    grant.save()

    # Update profile scholarship_type if linked
    if profile:
        profile.scholarship_type = scholarship_type
        profile.save(update_fields=["scholarship_type"])

    from .scholarship_registry import _SCHOLARSHIP_LABELS
    stype_label = _SCHOLARSHIP_LABELS.get(grant.scholarship_type, grant.scholarship_type.upper())

    return JsonResponse({
        "ok": True,
        "message": f"Scholar {grant.scholar_name} saved successfully.",
        "record": {
            "id": str(grant.id),
            "no": grant.no or "—",
            "scholarName": grant.scholar_name,
            "lastName": grant.last_name or "—",
            "firstName": grant.first_name or "—",
            "middleName": grant.middle_name or "—",
            "birthDate": grant.birthdate or "—",
            "address": grant.address or "—",
            "email": grant.email or "—",
            "program": grant.program or "—",
            "sponsor": grant.sponsor_name or "Scholarship Grant",
            "slotId": grant.slot_id or "—",
            "amount": grant.amount or "—",
            "scholarshipType": grant.scholarship_type,
            "scholarshipLabel": stype_label,
            "academicYear": grant.academic_year or "AY 2026–2027",
            "isLinked": bool(grant.profile_id or grant.registration_id),
            "statusLabel": "Linked (Enrolled Student)" if (grant.profile_id or grant.registration_id) else "Saved Scholar Record",
            "grantedAt": grant.granted_at.strftime("%Y-%m-%d %I:%M %p") if grant.granted_at else "Just now",
        }
    })


@login_required(login_url="/")
@require_POST
def scholarship_delete_record(request):
    """Delete a scholar record and reset student scholarship type if appropriate."""
    denied = require_portal_access(request, REGISTRAR_ROLE)
    if denied:
        return JsonResponse({"ok": False, "message": "Access denied."}, status=403)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "message": "Invalid JSON payload."}, status=400)

    record_id = (body.get("recordId") or "").strip()
    if not record_id:
        return JsonResponse({"ok": False, "message": "Record ID is required."}, status=400)

    grant = ScholarGrantRecord.objects.filter(pk=record_id).first()
    if not grant:
        return JsonResponse({"ok": False, "message": "Scholar record not found."}, status=404)

    profile = grant.profile
    grant.delete()

    if profile:
        other_grants = ScholarGrantRecord.objects.filter(profile=profile, is_active=True).exists()
        if not other_grants:
            profile.scholarship_type = ""
            profile.save(update_fields=["scholarship_type"])

    return JsonResponse({
        "ok": True,
        "message": "Scholar record removed successfully.",
    })

