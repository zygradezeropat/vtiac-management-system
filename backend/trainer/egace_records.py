"""
Trainer module — student progress records (legacy demo fallback for E.G.A.C.E).

Live registrar rows are built in egace_progress.build_registrar_egace_rows().
"""

# Trainer-only / legacy fields omitted from registrar EGACE rows
EGACE_EXCLUDED_FIELDS = frozenset(
    {
        "employmentStatus",
        "employmentDetails",
        "trainerStatus",
        "statementOfAccount",
        "graduateAuto",
        "certified",
    }
)

# Canonical trainer-module records
TRAINER_STUDENT_PROGRESS = []


def project_trainer_record_for_egace(record):
    """Normalize trainer record into registrar EGACE row shape."""
    row = {key: value for key, value in record.items() if key not in EGACE_EXCLUDED_FIELDS}
    row.setdefault("enrolled", True)
    row.setdefault("certificate", record.get("certified", False))
    row.setdefault("employment", False)
    course = (row.get("course") or "").strip()
    if not row.get("batchLabel"):
        row["batchLabel"] = "Unassigned"
    if not row.get("batchId"):
        label = row["batchLabel"]
        row["batchId"] = f"{course}|{label}" if course else label
    return row


def egace_rows_for_registrar():
    from .egace_progress import build_registrar_egace_rows

    return build_registrar_egace_rows()
