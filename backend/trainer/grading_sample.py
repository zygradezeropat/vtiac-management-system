"""Sample unit competencies and learning outcomes for trainer grading demo."""

SAMPLE_UNIT_COMPETENCIES = {
    "Automotive Servicing NC I": [
        {"id": "uc-1", "code": "UC-1", "title": "Perform mensuration and calculation"},
        {"id": "uc-2", "code": "UC-2", "title": "Perform shop maintenance"},
        {"id": "uc-3", "code": "UC-3", "title": "Identify automotive parts and tools"},
        {"id": "uc-4", "code": "UC-4", "title": "Perform engine servicing"},
        {"id": "uc-5", "code": "UC-5", "title": "Perform electrical system servicing"},
        {"id": "uc-6", "code": "UC-6", "title": "Perform underchassis servicing"},
    ],
    "Automotive Servicing (Engine Repair) NC II": [
        {"id": "uc-1", "code": "UC-1", "title": "Diagnose engine mechanical problems"},
        {"id": "uc-2", "code": "UC-2", "title": "Overhaul gasoline engine"},
        {"id": "uc-3", "code": "UC-3", "title": "Overhaul diesel engine"},
        {"id": "uc-4", "code": "UC-4", "title": "Perform engine tune-up"},
        {"id": "uc-5", "code": "UC-5", "title": "Perform engine timing adjustment"},
    ],
    "Driving NC II": [
        {"id": "uc-1", "code": "UC-1", "title": "Perform pre- and post-operation procedures"},
        {"id": "uc-2", "code": "UC-2", "title": "Obey traffic rules and regulations"},
        {"id": "uc-3", "code": "UC-3", "title": "Perform defensive driving"},
        {"id": "uc-4", "code": "UC-4", "title": "Perform basic troubleshooting"},
        {"id": "uc-5", "code": "UC-5", "title": "Perform minor maintenance"},
    ],
    "Rice Machinery Operations NC II": [
        {"id": "uc-1", "code": "UC-1", "title": "Perform pre-operation inspection"},
        {"id": "uc-2", "code": "UC-2", "title": "Operate rice transplanter"},
        {"id": "uc-3", "code": "UC-3", "title": "Operate combine harvester"},
        {"id": "uc-4", "code": "UC-4", "title": "Perform post-operation procedures"},
        {"id": "uc-5", "code": "UC-5", "title": "Perform basic maintenance"},
    ],
}

DEFAULT_UNIT_COMPETENCIES = [
    {"id": "uc-1", "code": "UC-1", "title": "Participate in workplace communication"},
    {"id": "uc-2", "code": "UC-2", "title": "Work in team environment"},
    {"id": "uc-3", "code": "UC-3", "title": "Solve/address general workplace problems"},
    {"id": "uc-4", "code": "UC-4", "title": "Develop career and life decisions"},
    {"id": "uc-5", "code": "UC-5", "title": "Contribute to workplace innovation"},
    {"id": "uc-6", "code": "UC-6", "title": "Present information"},
    {"id": "uc-7", "code": "UC-7", "title": "Apply critical thinking and problem solving"},
    {"id": "uc-8", "code": "UC-8", "title": "Practice occupational health and safety"},
    {"id": "uc-9", "code": "UC-9", "title": "Practice environmental protection"},
    {"id": "uc-10", "code": "UC-10", "title": "Apply quality standards"},
]

SAMPLE_LEARNING_OUTCOMES = [
    {"id": "lo-1", "label": "Apply safety procedures in the workplace"},
    {"id": "lo-2", "label": "Use tools and equipment correctly"},
    {"id": "lo-3", "label": "Follow standard operating procedures"},
    {"id": "lo-4", "label": "Maintain work area cleanliness and organization"},
]

WORKPLACE_COMMUNICATION_LOS = [
    {"id": "lo-1", "label": "LO1 - Obtain and Convey Workplace Information"},
    {"id": "lo-2", "label": "LO2 - Perform Duties Following Workplace Instructions"},
    {"id": "lo-3", "label": "LO3 - Receive and Respond to Workplace Communication"},
    {"id": "lo-4", "label": "LO4 - Participate in Workplace Communication"},
]

TEAM_ENVIRONMENT_LOS = [
    {"id": "lo-1", "label": "LO1 - Describe Team Role and Objective"},
    {"id": "lo-2", "label": "LO2 - Identify Own Role and Responsibility"},
    {"id": "lo-3", "label": "LO3 - Work as a Team Member"},
    {"id": "lo-4", "label": "LO4 - Communicate with Team Members"},
]

SPECIAL_LOS_BY_UC_TITLE = {
    "Demonstrate workplace communication": WORKPLACE_COMMUNICATION_LOS,
    "Participate in workplace communication": WORKPLACE_COMMUNICATION_LOS,
    "Work in a team environment": TEAM_ENVIRONMENT_LOS,
    "Work in team environment": TEAM_ENVIRONMENT_LOS,
}


def _learning_outcomes_for_uc(uc: dict, count: int = 4) -> list[dict]:
    title = (uc.get("title") or "").strip()
    preset = SPECIAL_LOS_BY_UC_TITLE.get(title)
    if preset:
        return [
            {"id": f"{uc['id']}-{row['id']}", "label": row["label"]}
            for row in preset
        ]
    return [
        {
            "id": f"{uc['id']}-lo-{index}",
            "label": f"LO{index} - {title}",
        }
        for index in range(1, count + 1)
    ]


def non_encodable_structure_for_program(program: str) -> list[dict]:
    """Read-only competency columns reflected from Record Sheet scores."""
    _ = program
    return [
        {
            "id": "basic",
            "label": "BASIC COMPETENCIES",
            "units": list(DEFAULT_UNIT_COMPETENCIES),
        },
    ]


def encodable_structure_for_program(program: str) -> list[dict]:
    """Categories, unit competencies, and learning outcomes for the encodable sheet."""
    ucs = unit_competencies_for_program(program)
    if not ucs:
        return []

    split_at = max(1, (len(ucs) + 1) // 2)
    basic_units = ucs[:split_at]
    common_units = ucs[split_at:] or ucs[:1]

    def build_units(unit_list: list[dict]) -> list[dict]:
        return [
            {
                **uc,
                "learning_outcomes": _learning_outcomes_for_uc(uc),
            }
            for uc in unit_list
        ]

    categories = [
        {
            "id": "basic",
            "label": "BASIC COMPETENCIES",
            "units": build_units(basic_units),
        },
    ]
    if common_units and common_units is not basic_units:
        categories.append(
            {
                "id": "common",
                "label": "COMMON COMPETENCIES",
                "units": build_units(common_units),
            }
        )
    return categories


def flatten_learning_outcomes(categories: list[dict]) -> list[dict]:
    rows = []
    for category in categories:
        for unit in category.get("units") or []:
            rows.extend(unit.get("learning_outcomes") or [])
    return rows


def unit_competencies_for_program(program: str) -> list[dict]:
    return list(
        SAMPLE_UNIT_COMPETENCIES.get(program) or DEFAULT_UNIT_COMPETENCIES
    )


def student_grading_key(student: dict) -> str:
    ref = (student.get("reference_id") or "").strip()
    if ref:
        return ref
    name = (student.get("name") or "").strip().lower()
    program = (student.get("program") or "").strip().lower()
    return f"{name}|{program}"


def grading_page_payload(students: list[dict]) -> dict:
    """JSON-safe config for the grading page demo."""
    roster = []
    for student in students:
        roster.append(
            {
                "key": student_grading_key(student),
                "name": student.get("name") or "—",
                "first_name": student.get("first_name") or "",
                "middle_name": student.get("middle_name") or "",
                "last_name": student.get("last_name") or "",
                "initials": student.get("initials") or "?",
                "program": student.get("program") or "",
                "batch_label": student.get("batch_label") or "",
                "schedule": student.get("schedule") or "",
            }
        )

    if not roster:
        roster = [
            {
                "key": "demo-juan-dela-cruz",
                "name": "Juan Dela Cruz",
                "first_name": "Juan",
                "middle_name": "",
                "last_name": "Dela Cruz",
                "initials": "JD",
                "program": "Automotive Servicing NC I",
                "batch_label": "Batch 2026-A",
                "schedule": "Mon–Fri · 8:00 AM – 12:00 NN",
            },
            {
                "key": "demo-maria-santos",
                "name": "Maria Santos",
                "first_name": "Maria",
                "middle_name": "",
                "last_name": "Santos",
                "initials": "MS",
                "program": "Automotive Servicing NC I",
                "batch_label": "Batch 2026-A",
                "schedule": "Mon–Fri · 8:00 AM – 12:00 NN",
            },
            {
                "key": "demo-pedro-garcia",
                "name": "Pedro Garcia",
                "first_name": "Pedro",
                "middle_name": "",
                "last_name": "Garcia",
                "initials": "PG",
                "program": "Driving NC II",
                "batch_label": "Batch 2026-B",
                "schedule": "Sat–Sun · 1:00 PM – 5:00 PM",
            },
        ]

    programs = sorted({s["program"] for s in roster if s.get("program")})
    competencies_by_program = {
        program: unit_competencies_for_program(program) for program in programs
    }
    encodable_by_program = {
        program: encodable_structure_for_program(program) for program in programs
    }
    non_encodable_by_program = {
        program: non_encodable_structure_for_program(program) for program in programs
    }
    for student in roster:
        program = student.get("program") or ""
        if program and program not in competencies_by_program:
            competencies_by_program[program] = unit_competencies_for_program(program)
        if program and program not in encodable_by_program:
            encodable_by_program[program] = encodable_structure_for_program(program)
        if program and program not in non_encodable_by_program:
            non_encodable_by_program[program] = non_encodable_structure_for_program(program)

    all_learning_outcomes = []
    seen_lo_ids = set()
    for categories in encodable_by_program.values():
        for lo in flatten_learning_outcomes(categories):
            if lo["id"] in seen_lo_ids:
                continue
            seen_lo_ids.add(lo["id"])
            all_learning_outcomes.append(lo)

    return {
        "students": roster,
        "competencies_by_program": competencies_by_program,
        "encodable_by_program": encodable_by_program,
        "non_encodable_by_program": non_encodable_by_program,
        "learning_outcomes": all_learning_outcomes or SAMPLE_LEARNING_OUTCOMES,
        "passing_average": 75,
    }
