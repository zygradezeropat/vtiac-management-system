from django.urls import path

from . import views
from .batching_api import (
    batching_batches_list,
    batching_template_delete,
    batching_template_finalize,
    batching_template_upsert,
)
from .document_review_api import document_approve, document_reject, document_release
from .enrollment_detail import enrollment_detail
from .egace_api import egace_set_certificate, egace_set_employment
from .pending_enrollment import enrollment_approve, enrollment_reject
from .schedule_api import student_schedule_options
urlpatterns = [
    path(
        "dashboard/registrar/",
        views.dashboard_redirect,
        name="dashboard_registrar_redirect",
    ),
    path("registrar/<str:module>/", views.module_page, name="registrar_module"),
    path(
        "registrar/api/profiles/<int:profile_id>/schedule-options/",
        student_schedule_options,
        name="registrar_profile_schedule_options",
    ),
    path(
        "registrar/api/enrollment/detail/",
        enrollment_detail,
        name="registrar_enrollment_detail",
    ),
    path(
        "registrar/api/enrollment/approve/",
        enrollment_approve,
        name="registrar_enrollment_approve",
    ),
    path(
        "registrar/api/enrollment/reject/",
        enrollment_reject,
        name="registrar_enrollment_reject",
    ),
    path(
        "registrar/api/enrollment/document/approve/",
        document_approve,
        name="registrar_enrollment_document_approve",
    ),
    path(
        "registrar/api/enrollment/document/reject/",
        document_reject,
        name="registrar_enrollment_document_reject",
    ),
    path(
        "registrar/api/enrollment/document/release/",
        document_release,
        name="registrar_enrollment_document_release",
    ),
    path(
        "registrar/api/egace/employment/",
        egace_set_employment,
        name="registrar_egace_set_employment",
    ),
    path(
        "registrar/api/egace/certificate/",
        egace_set_certificate,
        name="registrar_egace_set_certificate",
    ),
    path(
        "registrar/api/batching/batches/",
        batching_batches_list,
        name="registrar_batching_batches_list",
    ),
    path(
        "registrar/api/batching/template/upsert/",
        batching_template_upsert,
        name="registrar_batching_template_upsert",
    ),
    path(
        "registrar/api/batching/template/finalize/<str:template_id>/",
        batching_template_finalize,
        name="registrar_batching_template_finalize",
    ),
    path(
        "registrar/api/batching/template/delete/<str:template_id>/",
        batching_template_delete,
        name="registrar_batching_template_delete",
    ),
]
