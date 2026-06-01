from django.contrib import admin

from .models import TrainerAccountRequest


@admin.register(TrainerAccountRequest)
class TrainerAccountRequestAdmin(admin.ModelAdmin):
    list_display = (
        "reference_id",
        "last_name",
        "first_name",
        "email",
        "status",
        "created_at",
    )
    list_filter = ("status", "years_experience", "created_at")
    search_fields = ("reference_id", "email", "last_name", "first_name", "phone_number")
    readonly_fields = ("id", "reference_id", "password_hash", "created_at")
