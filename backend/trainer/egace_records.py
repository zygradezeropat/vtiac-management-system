"""
Trainer module — student progress records (source of truth for E.G.A.C.E mirroring).

Employment fields exist on trainer records but are hard-excluded from registrar EGACE output.
"""

# Fields that must never appear in the registrar E.G.A.C.E table (9.1)
EGACE_EXCLUDED_FIELDS = frozenset(
    {
        "employment",
        "employmentStatus",
        "employmentDetails",
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
    """Mirror trainer record into EGACE row; employment fields are never included."""
    return {key: value for key, value in record.items() if key not in EGACE_EXCLUDED_FIELDS}


def egace_rows_for_registrar():
    return [project_trainer_record_for_egace(r) for r in TRAINER_STUDENT_PROGRESS]
