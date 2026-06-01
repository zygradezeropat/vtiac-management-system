from django.contrib import admin

from .models import (
    StudentEnrollmentDocument,
    StudentEnrollmentProfile,
    StudentPaymentProof,
    StudentProfile,
    StudentRegistration,
    StudentScheduleOption,
)


class StudentPaymentProofInline(admin.TabularInline):
    model = StudentPaymentProof
    extra = 0
    readonly_fields = ("uploaded_at",)
    fields = ("file", "original_filename", "reference_note", "uploaded_at")


class StudentScheduleOptionInline(admin.TabularInline):
    model = StudentScheduleOption
    extra = 1
    fields = (
        "label",
        "day",
        "time_from",
        "time_to",
        "batch_label",
        "course_name",
        "start_date",
        "end_date",
        "trainer",
        "sort_order",
    )


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = ("user",)
    search_fields = ("user__email", "user__username")


@admin.register(StudentRegistration)
class StudentRegistrationAdmin(admin.ModelAdmin):
    list_display = (
        "reference_id",
        "last_name",
        "first_name",
        "email",
        "selected_program",
        "status",
        "created_at",
    )
    list_filter = ("status", "program_type", "created_at")
    search_fields = ("reference_id", "email", "last_name", "first_name", "phone_number")
    readonly_fields = ("id", "reference_id", "created_at", "user")
    raw_id_fields = ("user",)


@admin.register(StudentEnrollmentProfile)
class StudentEnrollmentProfileAdmin(admin.ModelAdmin):
    list_display = (
        "last_name",
        "first_name",
        "email",
        "selected_program",
        "profile_step_completed",
        "requirements_submitted",
        "updated_at",
    )
    list_filter = (
        "profile_step_completed",
        "requirements_submitted",
        "program_type",
        "updated_at",
    )
    search_fields = ("last_name", "first_name", "email", "tsmis", "uli")
    readonly_fields = ("created_at", "updated_at", "schedule_selected_at")
    raw_id_fields = ("user", "registration", "preferred_schedule")
    inlines = [StudentScheduleOptionInline, StudentPaymentProofInline]


@admin.register(StudentPaymentProof)
class StudentPaymentProofAdmin(admin.ModelAdmin):
    list_display = ("profile", "original_filename", "reference_note", "uploaded_at")
    list_filter = ("uploaded_at",)
    search_fields = ("profile__email", "profile__last_name", "original_filename", "reference_note")
    raw_id_fields = ("profile",)


@admin.register(StudentScheduleOption)
class StudentScheduleOptionAdmin(admin.ModelAdmin):
    list_display = ("profile", "label", "day", "time_from", "time_to", "sort_order")
    list_filter = ("day",)
    search_fields = ("profile__email", "profile__last_name", "label", "batch_label")
    raw_id_fields = ("profile",)


@admin.register(StudentEnrollmentDocument)
class StudentEnrollmentDocumentAdmin(admin.ModelAdmin):
    list_display = ("profile", "document_type", "original_filename", "id_type", "uploaded_at")
    list_filter = ("document_type", "uploaded_at")
    search_fields = ("profile__email", "profile__last_name", "original_filename")
    raw_id_fields = ("profile",)
