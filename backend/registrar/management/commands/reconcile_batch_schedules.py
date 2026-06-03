"""Remove class schedules wrongly assigned to students not on any finalized batch roster."""

from django.core.management.base import BaseCommand

from backend.registrar.batch_schedule_sync import reconcile_orphan_batch_schedules


class Command(BaseCommand):
    help = (
        "Clear schedules on approved students who were auto-assigned but are not "
        "listed on any finalized batch students_snapshot."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report how many records would be cleared without changing data.",
        )

    def handle(self, *args, **options):
        result = reconcile_orphan_batch_schedules(dry_run=options["dry_run"])
        prefix = "Would clear" if result["dry_run"] else "Cleared"
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix} {result['profiles_cleared']} profile(s) "
                f"across {result['registrations_cleared']} registration(s)."
            )
        )
