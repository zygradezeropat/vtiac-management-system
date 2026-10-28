from django.urls import path

from . import api, views

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
        "admin/api/programs/<int:program_id>/competencies/",
        api.program_competencies_manage,
        name="admin_program_competencies_manage",
    ),
    path(
        "admin/api/competencies/library/",
        api.competencies_library,
        name="admin_competencies_library",
    ),
    path("admin/api/schedules/create/", api.schedules_create, name="admin_schedules_create"),
    path(
        "admin/api/schedules/<int:schedule_id>/",
        api.schedules_update,
        name="admin_schedules_update",
    ),
    path(
        "admin/api/schedules/<int:schedule_id>/delete/",
        api.schedules_delete,
        name="admin_schedules_delete",
    ),
    path("admin/<str:module>/", views.module_page, name="admin_module"),
]
