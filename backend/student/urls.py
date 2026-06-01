from django.urls import path

from . import document_views, views

urlpatterns = [
    path("register/", views.register, name="register"),
    path("register/check-email/", views.check_register_email, name="register_check_email"),
    path("dashboard/student/", views.dashboard, name="student_dashboard"),
    path("dashboard/student/enrollment/", views.enrollment, name="student_enrollment"),
    path(
        "dashboard/student/enrollment/requirements/",
        views.enrollment_requirements,
        name="student_enrollment_requirements",
    ),
    path(
        "dashboard/student/enrollment/pending/",
        views.enrollment_pending,
        name="student_enrollment_pending",
    ),
    path("dashboard/student/payments/", views.payments, name="student_payments"),
    path("dashboard/student/documents/", document_views.documents, name="student_documents"),
    path("dashboard/student/settings/", views.settings, name="student_settings"),
    path(
        "dashboard/student/documents/<str:doc_key>/view/",
        document_views.document_view,
        name="student_document_view",
    ),
    path(
        "dashboard/student/documents/<str:doc_key>/download/",
        document_views.document_download,
        name="student_document_download",
    ),
]