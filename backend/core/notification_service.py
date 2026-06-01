"""Create and query portal notifications."""

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import PortalNotification, StaffProfile

User = get_user_model()


def unread_count(user) -> int:
    if not user or not user.is_authenticated:
        return 0
    return PortalNotification.objects.filter(user=user, read_at__isnull=True).count()


def notifications_for_user(user, *, limit=30):
    if not user or not user.is_authenticated:
        return []
    qs = PortalNotification.objects.filter(user=user).order_by("-created_at")[:limit]
    return [_serialize(n) for n in qs]


def _serialize(notification: PortalNotification) -> dict:
    created = timezone.localtime(notification.created_at)
    return {
        "id": notification.pk,
        "category": notification.category,
        "title": notification.title,
        "message": notification.message,
        "linkUrl": notification.link_url or "",
        "isRead": notification.is_read,
        "createdAt": created.strftime("%b %d, %Y · %I:%M %p").replace(" 0", " "),
        "createdAtIso": notification.created_at.isoformat(),
    }


def create_notification(
    user,
    *,
    category: str,
    title: str,
    message: str,
    link_url: str = "",
    related_profile_id: int | None = None,
) -> PortalNotification | None:
    if not user or not getattr(user, "pk", None):
        return None
    return PortalNotification.objects.create(
        user=user,
        category=category,
        title=title[:200],
        message=message,
        link_url=link_url[:500],
        related_profile_id=related_profile_id,
    )


def notify_users(users, **kwargs):
    created = []
    for user in users:
        n = create_notification(user, **kwargs)
        if n:
            created.append(n)
    return created


def registrar_users():
    return User.objects.filter(
        staff_profile__role=StaffProfile.Role.REGISTRAR,
        is_active=True,
    ).distinct()


def mark_read(user, notification_id: int) -> bool:
    updated = PortalNotification.objects.filter(
        user=user, pk=notification_id, read_at__isnull=True
    ).update(read_at=timezone.now())
    return updated > 0


def mark_all_read(user) -> int:
    return PortalNotification.objects.filter(user=user, read_at__isnull=True).update(
        read_at=timezone.now()
    )
