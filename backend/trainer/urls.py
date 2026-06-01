from django.urls import path

from . import views

urlpatterns = [
    path("trainer/request/", views.trainer_request, name="trainer_request"),
    path("dashboard/trainer/", views.dashboard, name="trainer_dashboard"),
    path(
        "trainer/api/settings/profile/",
        views.settings_profile_api,
        name="trainer_settings_profile_api",
    ),
    path(
        "trainer/api/settings/password/",
        views.settings_password_api,
        name="trainer_settings_password_api",
    ),
    path(
        "trainer/api/grading/save/",
        views.grading_save_api,
        name="trainer_grading_save_api",
    ),
    path(
        "trainer/api/grading/records/",
        views.grading_records_api,
        name="trainer_grading_records_api",
    ),
    path("trainer/<str:module>/", views.module_page, name="trainer_module"),
]
