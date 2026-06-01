"""Admin portal — list and manage portal users (staff and students)."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q

from backend.core.models import StaffProfile
from backend.student.models import StudentProfile

User = get_user_model()

STAFF_ROLE_VALUES = {choice[0] for choice in StaffProfile.Role.choices}
ACCOUNT_TYPES = ("staff", "student")
PAGE_SIZE = 10


def _display_name(user):
    name = user.get_full_name().strip()
    return name or user.email or user.username


def _account_type_for(user):
    if hasattr(user, "staff_profile"):
        return "staff"
    if hasattr(user, "student_profile"):
        return "student"
    return "other"


def _role_label(user):
    account_type = _account_type_for(user)
    if account_type == "staff":
        return user.staff_profile.get_role_display()
    if account_type == "student":
        return "Student"
    return "—"


def serialize_user(user):
    account_type = _account_type_for(user)
    role = ""
    if account_type == "staff":
        role = user.staff_profile.role
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": _display_name(user),
        "account_type": account_type,
        "role": role,
        "role_label": _role_label(user),
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "date_joined": user.date_joined.isoformat() if user.date_joined else "",
    }


def list_users(*, search="", account_type="", role="", page=1):
    qs = (
        User.objects.select_related("staff_profile", "student_profile")
        .filter(Q(staff_profile__isnull=False) | Q(student_profile__isnull=False))
        .order_by("-date_joined")
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
    elif account_type == "student":
        qs = qs.filter(student_profile__isnull=False)

    role = (role or "").strip().lower()
    if role in STAFF_ROLE_VALUES:
        qs = qs.filter(staff_profile__role=role)

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


def create_user(*, account_type, email, first_name, last_name, password, role=""):
    account_type = (account_type or "").strip().lower()
    if account_type not in ACCOUNT_TYPES:
        raise ValueError("Account type must be staff or student.")

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
            StaffProfile.objects.create(user=user, role=role)
        else:
            StudentProfile.objects.create(user=user)

    return serialize_user(user)


def update_user(user_id, *, email=None, first_name=None, last_name=None, role=None, is_active=None):
    try:
        user = User.objects.select_related("staff_profile", "student_profile").get(pk=user_id)
    except User.DoesNotExist as exc:
        raise ValueError("User not found.") from exc

    if _account_type_for(user) == "other":
        raise ValueError("This account is not a portal user.")

    if email is not None:
        email = _validate_email_unique(email, exclude_user_id=user.pk)
        user.email = email
        user.username = email

    if first_name is not None:
        user.first_name = (first_name or "").strip()
    if last_name is not None:
        user.last_name = (last_name or "").strip()

    if is_active is not None:
        user.is_active = bool(is_active)

    if role is not None and hasattr(user, "staff_profile"):
        role = (role or "").strip().lower()
        if role not in STAFF_ROLE_VALUES:
            raise ValueError("Select a valid staff role.")
        user.staff_profile.role = role
        user.staff_profile.save(update_fields=["role"])

    user.save()
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
