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

# Canonical trainer-module records (includes employment for trainer-only views)
TRAINER_STUDENT_PROGRESS = [
    {
        "id": 1,
        "initials": "PG",
        "studentName": "Pedro Garcia",
        "course": "Driving NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
    {
        "id": 2,
        "initials": "AL",
        "studentName": "Ana Lopez",
        "course": "Rice Machinery Operations NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
    {
        "id": 3,
        "initials": "CM",
        "studentName": "Carlos Mendoza",
        "course": "Automotive Servicing NC I",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
    {
        "id": 4,
        "initials": "MT",
        "studentName": "Miguel Torres",
        "course": "Driving NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Seeking",
        "employmentDetails": {"employer": None, "position": "Driver trainee", "hiredDate": None},
    },
    {
        "id": 5,
        "initials": "RV",
        "studentName": "Rosa Villanueva",
        "course": "Automotive Servicing (Engine Repair) NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
    {
        "id": 6,
        "initials": "JB",
        "studentName": "Jose Bautista",
        "course": "Driving NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
    {
        "id": 7,
        "initials": "NF",
        "studentName": "Nina Fernandez",
        "course": "Rice Machinery Operations NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
    {
        "id": 8,
        "initials": "DR",
        "studentName": "Dennis Reyes",
        "course": "Automotive Servicing NC I",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Employed",
        "employmentDetails": {"employer": "AutoWorks Dagupan", "position": "Mechanic helper", "hiredDate": "2026-02-01"},
    },
    {
        "id": 9,
        "initials": "LC",
        "studentName": "Liza Castillo",
        "course": "Driving NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
    {
        "id": 10,
        "initials": "HK",
        "studentName": "Harold Kim",
        "course": "Driving NC II",
        "trainerStatus": "Pending",
        "statementOfAccount": "Full Payment",
        "graduate": False,
        "graduateAuto": True,
        "assessment": False,
        "certified": False,
        "employmentStatus": "Not employed",
        "employmentDetails": {"employer": None, "position": None, "hiredDate": None},
    },
]


def project_trainer_record_for_egace(record):
    """Normalize legacy trainer demo record into registrar EGACE row shape."""
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

    rows = build_registrar_egace_rows()
    if rows:
        return rows
    return [project_trainer_record_for_egace(r) for r in TRAINER_STUDENT_PROGRESS]
