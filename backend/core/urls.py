from django.urls import path
from django.views.generic import RedirectView

from . import views
from .notification_views import (
    notification_list,
    notification_mark_all_read,
    notification_mark_read,
)

urlpatterns = [
    path("", views.landing, name="landing"),
    path("api/notifications/", notification_list, name="portal_notifications"),
    path(
        "api/notifications/mark-all-read/",
        notification_mark_all_read,
        name="portal_notifications_mark_all_read",
    ),
    path(
        "api/notifications/<int:notification_id>/read/",
        notification_mark_read,
        name="portal_notification_mark_read",
    ),
    path(
        "favicon.ico",
        RedirectView.as_view(url="/static/img/favicon.ico", permanent=False),
        name="favicon",
    ),
]
