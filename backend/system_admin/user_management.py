"""Admin portal — list and manage portal users (staff and students)."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q

from backend.core.models import StaffProfile
from backend.student.models import CandidateProfile, StudentProfile
from backend.trainer.approval import approve_trainer_request
from backend.trainer.services import (
    create_trainer_account_request,
    parse_trainer_request_data,
    validate_trainer_request_data,
)

User = get_user_model()

STAFF_ROLE_VALUES = {choice[0] for choice in StaffProfile.Role.choices}
ACCOUNT_TYPES = ("staff", "student", "candidate", "graduate")
PAGE_SIZE = 10


def _display_name(user):
    name = user.get_full_name().strip()
    return name or user.email or user.username


def _account_type_for(user):
    if hasattr(user, "staff_profile"):
        return "staff"
    if hasattr(user, "candidate_profile"):
        return "candidate"
    from backend.student.services import is_assessment_only_user, student_is_user_graduated
    if is_assessment_only_user(user):
        return "candidate"
    if hasattr(user, "student_profile"):
        if student_is_user_graduated(user):
            return "graduate"
        return "student"
    return "other"


def _role_label(user):
    account_type = _account_type_for(user)
    if account_type == "staff":
        return user.staff_profile.get_role_display()
    if account_type == "graduate":
        return "Graduate"
    if account_type == "candidate":
        return "Candidate"
    if account_type == "student":
        return "Student"
    return "—"


def serialize_user(user):
    account_type = _account_type_for(user)
    role = ""
    additional_roles = []
    substitute_info = {
        "additional_roles": [],
        "expires_at": "",
        "expires_at_display": "",
        "is_active": False,
        "is_expired": False,
        "hours_remaining": None,
    }
    qualifications = []
    if account_type == "staff":
        role = user.staff_profile.role
        additional_roles = getattr(user.staff_profile, "additional_roles", []) or []
        prof = user.staff_profile
        substitute_info["additional_roles"] = additional_roles
        substitute_info["is_active"] = prof.is_substitute_active()
        if prof.additional_roles_expires_at:
            from django.utils import timezone

            exp = prof.additional_roles_expires_at
            exp_local = timezone.localtime(exp)
            substitute_info["expires_at"] = exp_local.isoformat()
            substitute_info["expires_at_display"] = exp_local.strftime("%b %d, %I:%M %p")
            now = timezone.now()
            if now > exp:
                substitute_info["is_expired"] = True
                substitute_info["hours_remaining"] = 0
            else:
                rem_seconds = (exp - now).total_seconds()
                substitute_info["hours_remaining"] = max(1, int(rem_seconds // 3600))

        if role == StaffProfile.Role.TRAINER:
            from backend.trainer.models import TrainerAccountRequest

            treq = TrainerAccountRequest.objects.filter(email__iexact=user.email).first()
            if treq and isinstance(treq.qualifications, list):
                qualifications = treq.qualifications

    is_graduated = account_type == "graduate"
    graduated_at_iso = ""
    graduated_at_display = ""
    days_remaining = None
    days_passed = 0
    retention_expired = False

    if is_graduated:
        role = "graduate"
        reg = getattr(user, "registration_application", None)
        g_dt = getattr(reg, "graduated_at", None) if reg else None
        if not g_dt and reg:
            g_dt = reg.created_at
        if not g_dt:
            g_dt = user.date_joined

        from django.utils import timezone
        if g_dt:
            g_local = timezone.localtime(g_dt)
            graduated_at_iso = g_local.isoformat()
            graduated_at_display = g_local.strftime("%b %d, %Y")
            days_passed = max(0, (timezone.localdate() - g_local.date()).days)
            days_remaining = max(0, 365 - days_passed)
            retention_expired = days_passed >= 365
        else:
            days_remaining = 365
    elif account_type == "candidate":
        role = "candidate"
    elif account_type == "student":
        role = "student"

    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": _display_name(user),
        "account_type": account_type,
        "role": role,
        "additional_roles": additional_roles,
        "substitute_info": substitute_info,
        "role_label": _role_label(user),
        "qualifications": qualifications,
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "is_graduated": is_graduated,
        "graduated_at": graduated_at_iso,
        "graduated_at_display": graduated_at_display,
        "days_remaining": days_remaining,
        "days_passed": days_passed,
        "retention_expired": retention_expired,
        "date_joined": user.date_joined.isoformat() if user.date_joined else "",
    }


def list_users(*, search="", account_type="", role="", sort="", page=1):
    qs = (
        User.objects.select_related("staff_profile", "student_profile", "candidate_profile")
        .filter(
            Q(staff_profile__isnull=False)
            | Q(student_profile__isnull=False)
            | Q(candidate_profile__isnull=False)
            | Q(registration_application__program_type="assessment_only")
        )
    )

    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(email__icontains=search)
            | Q(username__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )

    account_type = (account_type or "").strip().lower()
    if account_type == "staff":
        qs = qs.filter(staff_profile__isnull=False)
    elif account_type == "graduate":
        qs = qs.filter(
            student_profile__isnull=False,
            registration_application__is_graduated=True,
        ).exclude(
            Q(candidate_profile__isnull=False)
            | Q(registration_application__program_type="assessment_only")
        )
    elif account_type == "candidate":
        qs = qs.filter(
            Q(candidate_profile__isnull=False)
            | Q(registration_application__program_type="assessment_only")
            | Q(enrollment_profile__program_type="assessment_only")
        )
    elif account_type == "student":
        qs = qs.filter(
            student_profile__isnull=False
        ).exclude(
            Q(registration_application__is_graduated=True)
            | Q(candidate_profile__isnull=False)
            | Q(registration_application__program_type="assessment_only")
            | Q(enrollment_profile__program_type="assessment_only")
        )

    role = (role or "").strip().lower()
    if role in STAFF_ROLE_VALUES:
        qs = qs.filter(staff_profile__role=role)

    sort = (sort or "").strip().lower()
    if sort == "name_desc":
        qs = qs.order_by("-first_name", "-last_name", "-username")
    elif sort == "name_asc":
        qs = qs.order_by("first_name", "last_name", "username")
    elif sort == "date_asc":
        qs = qs.order_by("date_joined")
    elif sort == "date_desc":
        qs = qs.order_by("-date_joined")
    else:
        qs = qs.order_by("first_name", "last_name", "username")

    try:
        page = max(1, int(page))
    except (TypeError, ValueError):
        page = 1

    total = qs.count()
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    if page > total_pages:
        page = total_pages

    start = (page - 1) * PAGE_SIZE
    users = [serialize_user(u) for u in qs[start : start + PAGE_SIZE]]

    return {
        "users": users,
        "total": total,
        "page": page,
        "page_size": PAGE_SIZE,
        "total_pages": total_pages,
    }


def _validate_email_unique(email, exclude_user_id=None):
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email is required.")
    qs = User.objects.filter(email__iexact=email)
    if exclude_user_id:
        qs = qs.exclude(pk=exclude_user_id)
    if qs.exists():
        raise ValueError("A user with this email already exists.")
    return email


def _calculate_expiration(duration_choice=None, expires_at=None):
    from datetime import datetime, timedelta
    from django.utils import timezone
    from django.utils.dateparse import parse_datetime

    now = timezone.now()

    # 1. Custom dynamic expiration if provided
    if expires_at:
        dt = None
        if isinstance(expires_at, str) and expires_at.strip():
            expires_at_clean = expires_at.strip()
            dt = parse_datetime(expires_at_clean)
            if dt is None:
                try:
                    dt = datetime.fromisoformat(expires_at_clean)
                except ValueError:
                    dt = None
        elif isinstance(expires_at, datetime):
            dt = expires_at

        if dt is not None:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            return dt

    # 2. Preset duration choices
    choice = (duration_choice or "").strip().lower()
    if choice in ("1_day", "daily", "24_hours", "24h"):
        return now + timedelta(days=1)
    if choice in ("end_of_day", "today"):
        local_now = timezone.localtime(now)
        return local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
    if choice in ("3_days", "72h"):
        return now + timedelta(days=3)
    if choice in ("permanent", "no_expiry", "never"):
        return None

    # Default: 24 hours from current time
    return now + timedelta(days=1)


def create_user(*, account_type, email, first_name, last_name, password, role="", additional_roles=None, substitute_duration="1_day", expires_at=None, acting_user=None):
    account_type = (account_type or "").strip().lower()
    if account_type not in ("staff", "student", "candidate"):
        raise ValueError("Account type must be staff, student, or candidate.")

    email = _validate_email_unique(email)
    first_name = (first_name or "").strip()
    last_name = (last_name or "").strip()
    if not first_name or not last_name:
        raise ValueError("First name and last name are required.")
    if not password:
        raise ValueError("Password is required.")

    try:
        validate_password(password)
    except ValidationError as exc:
        raise ValueError(" ".join(exc.messages)) from exc

    with transaction.atomic():
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_staff=account_type == "staff",
        )
        if account_type == "staff":
            role = (role or "").strip().lower()
            if role not in STAFF_ROLE_VALUES:
                raise ValueError("Select a valid staff role.")
            if role in (StaffProfile.Role.REGISTRAR, StaffProfile.Role.CASHIER) and isinstance(additional_roles, list) and StaffProfile.Role.TRAINER in additional_roles:
                raise ValueError("Registrars and Cashiers cannot be assigned the Trainer substitute role.")
            valid_additionals = []
            if isinstance(additional_roles, list):
                valid_additionals = [r for r in additional_roles if r in STAFF_ROLE_VALUES and r != role]
                if role in (StaffProfile.Role.REGISTRAR, StaffProfile.Role.CASHIER):
                    valid_additionals = [r for r in valid_additionals if r != StaffProfile.Role.TRAINER]
            exp_val = _calculate_expiration(substitute_duration, expires_at=expires_at) if valid_additionals else None
            StaffProfile.objects.create(
                user=user,
                role=role,
                additional_roles=valid_additionals,
                additional_roles_expires_at=exp_val,
            )
        elif account_type == "candidate":
            CandidateProfile.objects.create(user=user)
        else:
            StudentProfile.objects.create(user=user)

        from backend.system_admin.touch_logger import log_staff_touch
        log_staff_touch(
            user=acting_user,
            portal_role="admin",
            module="user_management",
            action="Created User Account",
            target_type="User",
            target_id=user.pk,
            target_name=user.get_full_name() or user.email,
            details=f"Email: {user.email} | Type: {account_type} | Role: {role or 'student'}",
        )

    return serialize_user(user)


def create_trainer_staff_user(trainer_payload):
    """Create trainer via TrainerAccountRequest (same as public request), then approve."""
    data = parse_trainer_request_data(trainer_payload or {})
    errors = validate_trainer_request_data(data)
    if errors:
        raise ValueError(" ".join(errors))

    with transaction.atomic():
        request_record = create_trainer_account_request(data)
        approve_trainer_request(request_record)
        user = User.objects.select_related("staff_profile").get(
            email__iexact=request_record.email
        )

    return serialize_user(user)


def update_user(user_id, *, email=None, first_name=None, last_name=None, role=None, is_active=None, qualifications=None, additional_roles=None, substitute_duration=None, expires_at=None, acting_user=None):
    try:
        user = User.objects.select_related("staff_profile", "student_profile").get(pk=user_id)
    except User.DoesNotExist as exc:
        raise ValueError("User not found.") from exc

    if _account_type_for(user) == "other":
        raise ValueError("This account is not a portal user.")

    changes = []

    if email is not None:
        email = _validate_email_unique(email, exclude_user_id=user.pk)
        if user.email != email:
            changes.append(f"Email: {user.email} -> {email}")
        user.email = email
        user.username = email

    if first_name is not None:
        user.first_name = (first_name or "").strip()
    if last_name is not None:
        user.last_name = (last_name or "").strip()

    if is_active is not None:
        if user.is_active != bool(is_active):
            changes.append(f"Status: {'Active' if is_active else 'Inactive'}")
        user.is_active = bool(is_active)

    if hasattr(user, "staff_profile"):
        profile_changed = False
        if role is not None:
            role = (role or "").strip().lower()
            if role not in STAFF_ROLE_VALUES:
                raise ValueError("Select a valid staff role.")
            if user.staff_profile.role != role:
                changes.append(f"Role: {user.staff_profile.role} -> {role}")
            user.staff_profile.role = role
            profile_changed = True

        if additional_roles is not None:
            curr_primary = user.staff_profile.role
            if curr_primary in (StaffProfile.Role.REGISTRAR, StaffProfile.Role.CASHIER) and isinstance(additional_roles, list) and StaffProfile.Role.TRAINER in additional_roles:
                raise ValueError("Registrars and Cashiers cannot be assigned the Trainer substitute role.")
            valid_additionals = []
            if isinstance(additional_roles, list):
                valid_additionals = [r for r in additional_roles if r in STAFF_ROLE_VALUES and r != curr_primary]
                if curr_primary in (StaffProfile.Role.REGISTRAR, StaffProfile.Role.CASHIER):
                    valid_additionals = [r for r in valid_additionals if r != StaffProfile.Role.TRAINER]
            changes.append(f"Additional roles: {', '.join(valid_additionals) if valid_additionals else 'None'}")
            user.staff_profile.additional_roles = valid_additionals
            if valid_additionals:
                user.staff_profile.additional_roles_expires_at = _calculate_expiration(
                    duration_choice=substitute_duration,
                    expires_at=expires_at,
                )
            else:
                user.staff_profile.additional_roles_expires_at = None
            profile_changed = True

        if profile_changed:
            user.staff_profile.save()

    if qualifications is not None and hasattr(user, "staff_profile") and user.staff_profile.role == StaffProfile.Role.TRAINER:
        from backend.trainer.models import TrainerAccountRequest

        treq = TrainerAccountRequest.objects.filter(email__iexact=user.email).first()
        if treq:
            treq.qualifications = qualifications if isinstance(qualifications, list) else []
            treq.save(update_fields=["qualifications"])
            changes.append("Updated trainer qualifications")

    user.save()

    from backend.system_admin.touch_logger import log_staff_touch
    log_staff_touch(
        user=acting_user,
        portal_role="admin",
        module="user_management",
        action="Updated User Account",
        target_type="User",
        target_id=user.pk,
        target_name=user.get_full_name() or user.email,
        details=" | ".join(changes) if changes else f"Updated details for {user.email}",
    )
    user.refresh_from_db()
    return serialize_user(user)


def reset_user_password(user_id, password):
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist as exc:
        raise ValueError("User not found.") from exc

    if not password:
        raise ValueError("Password is required.")

    try:
        validate_password(password, user=user)
    except ValidationError as exc:
        raise ValueError(" ".join(exc.messages)) from exc

    user.set_password(password)
    user.save(update_fields=["password"])
    return {"ok": True}
