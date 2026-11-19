"""Centralized touch logger for tracking who modified which transaction / record."""

from django.core.paginator import Paginator
from django.db.models import Q
from django.utils import timezone


def log_staff_touch(
    *,
    user,
    portal_role="",
    module="",
    action="",
    target_type="",
    target_id="",
    target_name="",
    details="",
):
    from backend.system_admin.models import StaffTouchLog

    primary_role = ""
    user_name = ""
    user_email = ""
    if user and user.is_authenticated:
        user_email = user.email or user.username
        user_name = user.get_full_name().strip() or user.username
        if hasattr(user, "staff_profile"):
            primary_role = user.staff_profile.role

    if not portal_role:
        portal_role = primary_role or "staff"

    cleaned_details = str(details or "").strip()
    cleaned_action = str(action or "").strip()
    cleaned_target_name = str(target_name or "").strip()

    return StaffTouchLog.objects.create(
        user=user if user and user.is_authenticated else None,
        user_email=user_email,
        user_name=user_name,
        primary_role=primary_role,
        portal_role=portal_role,
        module=module,
        action=cleaned_action,
        target_type=target_type,
        target_id=str(target_id),
        target_name=cleaned_target_name,
        details=cleaned_details,
    )


def serialize_touch_log(log):
    local_dt = timezone.localtime(log.created_at)
    return {
        "id": log.id,
        "user_email": log.user_email,
        "user_name": log.user_name,
        "primary_role": log.primary_role,
        "portal_role": log.portal_role,
        "module": log.module,
        "action": log.action,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "target_name": log.target_name,
        "details": log.details,
        "created_at": local_dt.isoformat(),
        "created_at_display": local_dt.strftime("%b %d, %Y %I:%M %p"),
    }


def get_touch_logs_page_context(request=None):
    from backend.system_admin.models import StaffTouchLog

    qs = StaffTouchLog.objects.all().order_by("-created_at")

    total_count = qs.count()
    cashier_count = qs.filter(module="cashier").count()
    registrar_count = qs.filter(module="registrar").count()
    admin_count = qs.filter(module="user_management").count()

    module_filter = (request.GET.get("module") or "").strip().lower() if request else ""
    if module_filter and module_filter != "all":
        qs = qs.filter(module=module_filter)

    search_query = (request.GET.get("q") or "").strip() if request else ""
    if search_query:
        qs = qs.filter(
            Q(user_name__icontains=search_query)
            | Q(user_email__icontains=search_query)
            | Q(target_name__icontains=search_query)
            | Q(target_id__icontains=search_query)
            | Q(action__icontains=search_query)
            | Q(details__icontains=search_query)
        )

    page_num = request.GET.get("page", 1) if request else 1
    paginator = Paginator(qs, 20)
    page_obj = paginator.get_page(page_num)

    return {
        "touch_logs": page_obj,
        "total_count": total_count,
        "cashier_count": cashier_count,
        "registrar_count": registrar_count,
        "admin_count": admin_count,
        "active_module_filter": module_filter or "all",
        "search_query": search_query,
    }
