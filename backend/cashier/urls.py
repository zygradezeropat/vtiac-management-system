from django.urls import path

from . import api, views

urlpatterns = [
    path("dashboard/cashier/", views.dashboard, name="cashier_dashboard"),
    path("cashier/<str:module>/", views.module_page, name="cashier_module"),
    path("cashier/api/students/search/", api.students_search, name="cashier_students_search"),
    path("cashier/api/students/", api.students_list, name="cashier_students_list"),
    path(
        "cashier/api/control-number/",
        api.next_control_number,
        name="cashier_next_control_number",
    ),
    path(
        "cashier/api/students/fees/",
        api.student_fees,
        name="cashier_student_fees",
    ),
    path(
        "cashier/api/fees/schedule/",
        api.fee_schedule,
        name="cashier_fee_schedule",
    ),
    path(
        "cashier/api/payments/record/",
        api.record_payment,
        name="cashier_record_payment",
    ),
    path(
        "cashier/api/payments/",
        api.payments_list,
        name="cashier_payments_list",
    ),
    path(
        "cashier/api/dashboard/",
        api.dashboard_data,
        name="cashier_dashboard_data",
    ),
    path(
        "cashier/api/reports/",
        api.reports_data,
        name="cashier_reports_data",
    ),
    path(
        "cashier/api/reports/export/",
        api.reports_export,
        name="cashier_reports_export",
    ),
]
