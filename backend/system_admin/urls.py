from django.urls import path

from . import api, views
from backend.trainer.approval_views import (
    trainer_approval_approve,
    trainer_approval_reject,
)

urlpatterns = [
    path("dashboard/admin/", views.dashboard, name="admin_dashboard"),
    path("admin/api/users/", api.users_list, name="admin_users_list"),
    path("admin/api/users/create/", api.users_create, name="admin_users_create"),
    path("admin/api/users/<int:user_id>/", api.users_update, name="admin_users_update"),
    path(
        "admin/api/users/<int:user_id>/reset-password/",
        api.users_reset_password,
        name="admin_users_reset_password",
    ),
    path("admin/api/system-settings/", api.system_settings_get, name="admin_system_settings_get"),
    path(
        "admin/api/system-settings/update/",
        api.system_settings_update,
        name="admin_system_settings_update",
    ),
    path("admin/api/programs/create/", api.programs_create, name="admin_programs_create"),
    path(
        "admin/api/programs/<int:program_id>/",
        api.programs_update,
        name="admin_programs_update",
    ),
    path(
        "admin/api/trainer-approval/approve/",
        trainer_approval_approve,
        name="admin_trainer_approval_approve",
    ),
    path(
        "admin/api/trainer-approval/reject/",
        trainer_approval_reject,
        name="admin_trainer_approval_reject",
    ),
    path("admin/<str:module>/", views.module_page, name="admin_module"),
]
