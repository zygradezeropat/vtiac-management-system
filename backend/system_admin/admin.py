from django.contrib import admin

from .models import NcProgram, SystemSettings


@admin.register(NcProgram)
class NcProgramAdmin(admin.ModelAdmin):
    list_display = ("name", "training_fee", "sort_order", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    ordering = ("sort_order", "name")


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    list_display = ("fiscal_year_label", "registration_fee", "enrollment_open", "updated_at")
    readonly_fields = ("singleton_key",)

    def has_add_permission(self, request):
        if SystemSettings.objects.exists():
            return False
        return super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False
