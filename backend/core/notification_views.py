from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .notification_service import (
    mark_all_read,
    mark_read,
    notifications_for_user,
    unread_count,
)


@login_required(login_url="/")
@require_http_methods(["GET"])
def notification_list(request):
    return JsonResponse(
        {
            "unreadCount": unread_count(request.user),
            "notifications": notifications_for_user(request.user),
        }
    )


@login_required(login_url="/")
@require_http_methods(["POST"])
def notification_mark_read(request, notification_id):
    ok = mark_read(request.user, notification_id)
    if not ok:
        return JsonResponse({"error": "Notification not found."}, status=404)
    return JsonResponse({"unreadCount": unread_count(request.user)})


@login_required(login_url="/")
@require_http_methods(["POST"])
def notification_mark_all_read(request):
    mark_all_read(request.user)
    return JsonResponse({"unreadCount": 0})
