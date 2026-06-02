"""Sample unit competencies and learning outcomes for trainer grading demo."""

def _page_label(index: int) -> str:
    return f"Page {index * 2 - 1}"


AUTOMOTIVE_NC_I_RECORD_SHEET = [
    {
        "id": "basic",
        "label": "BASIC COMPETENCIES",
        "units": [
            {
                "id": "ats-basic-1",
                "title": "Participate in workplace communication",
                "page": _page_label(1),
            },
            {
                "id": "ats-basic-2",
                "title": "Work in team environment",
                "page": _page_label(2),
            },
            {
                "id": "ats-basic-3",
                "title": "Demonstrate work values",
                "page": _page_label(3),
            },
            {
                "id": "ats-basic-4",
                "title": "Practice basic housekeeping procedures",
                "page": _page_label(4),
            },
        ],
    },
    {
        "id": "common",
        "label": "COMMON COMPETENCIES",
        "units": [
            {
                "id": "ats-common-1",
                "code": "ALT723211",
                "title": "Validate vehicle specification",
                "page": _page_label(5),
            },
            {
                "id": "ats-common-2",
                "code": "ALT832212",
                "title": "Move and position vehicle",
                "page": _page_label(6),
            },
            {
                "id": "ats-common-3",
                "code": "ALT723214",
                "title": "Utilize automotive tools",
                "page": _page_label(7),
            },
            {
                "id": "ats-common-4",
                "code": "ALT723215",
                "title": "Perform mensuration and calculation",
                "page": _page_label(8),
            },
            {
                "id": "ats-common-5",
                "code": "ALT723216",
                "title": "Utilize workshop facilities and equipment",
                "page": _page_label(9),
            },
            {
                "id": "ats-common-6",
                "code": "ALT723217",
                "title": "Prepare servicing parts and consumables",
                "page": _page_label(10),
            },
            {
                "id": "ats-common-7",
                "code": "ALT723218",
                "title": "Prepare vehicle for servicing and releasing",
                "page": _page_label(11),
            },
        ],
    },
    {
        "id": "core",
        "label": "CORE COMPETENCIES",
        "units": [
            {
                "id": "ats-core-1",
                "code": "ALT723376",
                "title": "Perform pre-delivery inspection",
                "page": _page_label(12),
            },
            {
                "id": "ats-core-2",
                "code": "ALT723377",
                "title": "Perform periodic maintenance of automotive engine",
                "page": _page_label(13),
            },
            {
                "id": "ats-core-3",
                "code": "ALT723378",
                "title": "Perform periodic maintenance of drive train",
                "page": _page_label(14),
            },
            {
                "id": "ats-core-4",
                "code": "ALT723379",
                "title": "Perform periodic maintenance of brake system",
                "page": _page_label(15),
            },
            {
                "id": "ats-core-5",
                "code": "ALT723380",
                "title": "Perform periodic maintenance of suspension system",
                "page": _page_label(16),
            },
            {
                "id": "ats-core-6",
                "code": "ALT723381",
                "title": "Perform periodic maintenance of steering system",
                "page": _page_label(17),
            },
        ],
    },
]

RECORD_SHEET_BY_PROGRAM = {
    "Automotive Servicing NC I": AUTOMOTIVE_NC_I_RECORD_SHEET,
}

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

def _lo_rows(labels: list[str]) -> list[dict]:
    return [
        {"id": f"lo-{index}", "label": f"LO {index}. {label}"}
        for index, label in enumerate(labels, start=1)
    ]


LOS_BY_UC_TITLE: dict[str, list[dict]] = {
    "Participate in workplace communication": _lo_rows(
        [
            "Obtain and convey workplace information",
            "Participate in workplace meetings and discussions",
            "Complete relevant work related documents",
        ]
    ),
    "Demonstrate workplace communication": _lo_rows(
        [
            "Obtain and convey workplace information",
            "Participate in workplace meetings and discussions",
            "Complete relevant work related documents",
        ]
    ),
    "Work in team environment": _lo_rows(
        [
            "Describe team role and scope",
            "Identify own role and responsibility within team",
            "Work as a team member",
        ]
    ),
    "Work in a team environment": _lo_rows(
        [
            "Describe team role and scope",
            "Identify own role and responsibility within team",
            "Work as a team member",
        ]
    ),
    "Demonstrate work values": _lo_rows(
        [
            "Integrate personal objectives with organizational goals",
            "Set and meet work priorities",
            "Maintain professional growth and development",
        ]
    ),
    "Practice career professionalism": _lo_rows(
        [
            "Integrate personal objectives with organizational goals",
            "Set and meet work priorities",
            "Maintain professional growth and development",
        ]
    ),
    "Practice basic housekeeping procedures": _lo_rows(
        [
            "Perform housekeeping procedures",
            "Maintain tools and equipment",
            "Follow workplace housekeeping standards",
        ]
    ),
    "Practice occupational health and safety procedures": _lo_rows(
        [
            "Identify hazards and risks",
            "Evaluate hazards and risks",
            "Control hazards and risks",
            "Maintain OHS awareness",
        ]
    ),
    "Practice occupational health and safety": _lo_rows(
        [
            "Identify hazards and risks",
            "Evaluate hazards and risks",
            "Control hazards and risks",
            "Maintain OHS awareness",
        ]
    ),
    "Apply quality standards": _lo_rows(
        [
            "Assess quality of received articles",
            "Assess own work",
            "Engage in quality improvement",
        ]
    ),
    "Operate a personal computer": _lo_rows(
        [
            "Start the computer",
            "Access and use basic desktop icons and applications",
            "Create and store files",
            "Shut down the computer",
        ]
    ),
    "Perform computer operations": _lo_rows(
        [
            "Plan and prepare for tasks to be undertaken",
            "Input data into computer",
            "Access information using computer",
            "Produce/output data using computer system",
            "Use basic functions of a web-browser to locate information",
            "Maintain computer equipment and systems",
        ]
    ),
    "Use relevant technologies": _lo_rows(
        [
            "Select appropriate technology",
            "Apply relevant technology",
            "Maintain technology",
        ]
    ),
    "Maintain an effective relationship with clients/customers": _lo_rows(
        [
            "Maintain a clean and hygienic environment",
            "Meet client/customer requirements",
            "Build credibility with customers/clients",
        ]
    ),
    "Manage own performance": _lo_rows(
        [
            "Plan for completion of work tasks",
            "Manage time",
            "Maintain quality of performance",
        ]
    ),
    "Validate vehicle specification": _lo_rows(
        [
            "Identify vehicle specifications",
            "Validate specifications against requirements",
            "Document validation results",
        ]
    ),
    "Move and position vehicle": _lo_rows(
        [
            "Prepare vehicle for movement",
            "Move vehicle to designated position",
            "Secure vehicle after positioning",
        ]
    ),
    "Utilize automotive tools": _lo_rows(
        [
            "Select appropriate tools",
            "Use tools according to procedures",
            "Maintain tools after use",
        ]
    ),
    "Perform mensuration and calculation": _lo_rows(
        [
            "Obtain measurements",
            "Perform calculations",
            "Apply results to work tasks",
        ]
    ),
    "Utilize workshop facilities and equipment": _lo_rows(
        [
            "Prepare workshop area",
            "Operate workshop equipment",
            "Restore workshop after use",
        ]
    ),
    "Prepare servicing parts and consumables": _lo_rows(
        [
            "Identify required parts and consumables",
            "Prepare parts for servicing",
            "Store and handle consumables safely",
        ]
    ),
    "Prepare vehicle for servicing and releasing": _lo_rows(
        [
            "Prepare vehicle for servicing",
            "Complete pre-release checks",
            "Release vehicle to client",
        ]
    ),
    "Perform pre-delivery inspection": _lo_rows(
        [
            "Inspect vehicle systems",
            "Document inspection findings",
            "Recommend corrective actions",
        ]
    ),
    "Perform periodic maintenance of automotive engine": _lo_rows(
        [
            "Prepare for engine maintenance",
            "Perform engine maintenance tasks",
            "Complete post-maintenance procedures",
        ]
    ),
    "Perform periodic maintenance of drive train": _lo_rows(
        [
            "Prepare for drive train maintenance",
            "Perform drive train maintenance tasks",
            "Complete post-maintenance procedures",
        ]
    ),
    "Perform periodic maintenance of brake system": _lo_rows(
        [
            "Prepare for brake system maintenance",
            "Perform brake system maintenance tasks",
            "Complete post-maintenance procedures",
        ]
    ),
    "Perform periodic maintenance of suspension system": _lo_rows(
        [
            "Prepare for suspension maintenance",
            "Perform suspension maintenance tasks",
            "Complete post-maintenance procedures",
        ]
    ),
    "Perform periodic maintenance of steering system": _lo_rows(
        [
            "Prepare for steering maintenance",
            "Perform steering maintenance tasks",
            "Complete post-maintenance procedures",
        ]
    ),
}


def _learning_outcomes_for_uc(uc: dict, count: int = 3) -> list[dict]:
    title = (uc.get("title") or "").strip()
    preset = LOS_BY_UC_TITLE.get(title)
    if preset:
        return [
            {"id": f"{uc['id']}-{row['id']}", "label": row["label"]}
            for row in preset
        ]
    return [
        {
            "id": f"{uc['id']}-lo-{index}",
            "label": f"LO {index}. {title}",
        }
        for index in range(1, count + 1)
    ]


def _attach_learning_outcomes(categories: list[dict]) -> list[dict]:
    structured = []
    for category in categories:
        units = []
        for unit in category.get("units") or []:
            units.append(
                {
                    **unit,
                    "learning_outcomes": _learning_outcomes_for_uc(unit),
                }
            )
        structured.append({**category, "units": units})
    return structured


def non_encodable_structure_for_program(program: str) -> list[dict]:
    """Read-only competency columns reflected from Record Sheet scores."""
    # Automotive Servicing NC I uses the full TESDA competency column layout
    # (Basic/Common/Core) so Overall Results mirrors the provided sheet image.
    if (program or "").strip() == "Automotive Servicing NC I":
        return record_sheet_structure_for_program(program)

    units = unit_competencies_for_program(program)
    label = (program or "Unit Competencies").upper()
    return [
        {
            "id": "competencies",
            "label": label,
            "units": units,
        },
    ]


def encodable_structure_for_program(program: str) -> list[dict]:
    """Record sheet categories/units with learning outcomes for the encodable sheet."""
    record = record_sheet_structure_for_program(program)
    if record:
        return _attach_learning_outcomes(record)

    ucs = unit_competencies_for_program(program)
    if not ucs:
        return []

    split_at = max(1, (len(ucs) + 1) // 2)
    basic_units = ucs[:split_at]
    common_units = ucs[split_at:] or ucs[:1]

    categories = [
        {
            "id": "basic",
            "label": "BASIC COMPETENCIES",
            "units": basic_units,
        },
    ]
    if common_units and common_units is not basic_units:
        categories.append(
            {
                "id": "common",
                "label": "COMMON COMPETENCIES",
                "units": common_units,
            }
        )
    return _attach_learning_outcomes(categories)


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


def record_sheet_structure_for_program(program: str) -> list[dict]:
    """Excel-style rating sheet categories and UCs (Written / Demo / Interview per UC)."""
    preset = RECORD_SHEET_BY_PROGRAM.get(program)
    if preset:
        return preset

    units = unit_competencies_for_program(program)
    if not units:
        return []

    structured = []
    for index, uc in enumerate(units, start=1):
        structured.append(
            {
                **uc,
                "page": _page_label(index),
            }
        )
    return [
        {
            "id": "competencies",
            "label": (program or "COMPETENCIES").upper(),
            "units": structured,
        }
    ]


def flatten_record_sheet_units(categories: list[dict]) -> list[dict]:
    rows = []
    for category in categories:
        for unit in category.get("units") or []:
            rows.append({**unit, "category_label": category.get("label") or ""})
    return rows


def student_grading_key(student: dict) -> str:
    ref = (student.get("reference_id") or "").strip()
    if ref:
        batch_id = (student.get("batch_id") or "").strip()
        if batch_id:
            return f"{ref}|{batch_id}"
        return ref
    name = (student.get("name") or "").strip().lower()
    program = (student.get("program") or "").strip().lower()
    batch_id = (student.get("batch_id") or "").strip().lower()
    return f"{name}|{program}|{batch_id}"


def course_groups_from_roster(students: list[dict], batch_cards: list[dict] | None = None) -> list[dict]:
    """Group finalized batches by program for course tabs + batch selectors."""
    if batch_cards:
        by_program: dict[str, list[dict]] = {}
        for card in batch_cards:
            program = (card.get("course_name") or "").strip()
            if not program:
                continue
            by_program.setdefault(program, []).append(
                {
                    "id": str(card.get("id") or ""),
                    "label": card.get("batch_label") or "Batch 1",
                    "schedule": card.get("schedule_display") or "",
                    "student_count": card.get("student_count") or 0,
                }
            )
        return [
            {
                "program": program,
                "batches": sorted(batches, key=lambda b: b["label"].lower()),
            }
            for program, batches in sorted(by_program.items(), key=lambda x: x[0].lower())
        ]

    grouped: dict[str, dict[str, dict]] = {}
    for student in students:
        program = (student.get("program") or "").strip() or "Unassigned"
        batch_id = str(student.get("batch_id") or student.get("batch_label") or "default")
        label = (student.get("batch_label") or "Batch 1").strip()
        schedule = (student.get("schedule") or "").strip()
        grouped.setdefault(program, {})
        if batch_id not in grouped[program]:
            grouped[program][batch_id] = {
                "id": batch_id,
                "label": label,
                "schedule": schedule,
                "student_count": 0,
            }
        grouped[program][batch_id]["student_count"] += 1

    return [
        {
            "program": program,
            "batches": sorted(batches.values(), key=lambda b: b["label"].lower()),
        }
        for program, batches in sorted(grouped.items(), key=lambda x: x[0].lower())
    ]


def grading_page_payload(students: list[dict], batch_cards: list[dict] | None = None) -> dict:
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
                "batch_id": student.get("batch_id") or "",
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
                "batch_id": "demo-auto-a",
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
                "batch_id": "demo-auto-a",
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
                "batch_id": "demo-driving-b",
                "schedule": "Sat–Sun · 1:00 PM – 5:00 PM",
            },
        ]

    course_groups = course_groups_from_roster(roster, batch_cards)
    programs = sorted({s["program"] for s in roster if s.get("program")})
    default_program = course_groups[0]["program"] if course_groups else ""
    default_batch_id = (
        course_groups[0]["batches"][0]["id"]
        if course_groups and course_groups[0].get("batches")
        else ""
    )
    competencies_by_program = {
        program: unit_competencies_for_program(program) for program in programs
    }
    encodable_by_program = {
        program: encodable_structure_for_program(program) for program in programs
    }
    non_encodable_by_program = {
        program: non_encodable_structure_for_program(program) for program in programs
    }
    record_sheet_by_program = {
        program: record_sheet_structure_for_program(program) for program in programs
    }
    for student in roster:
        program = student.get("program") or ""
        if program and program not in competencies_by_program:
            competencies_by_program[program] = unit_competencies_for_program(program)
        if program and program not in encodable_by_program:
            encodable_by_program[program] = encodable_structure_for_program(program)
        if program and program not in non_encodable_by_program:
            non_encodable_by_program[program] = non_encodable_structure_for_program(program)
        if program and program not in record_sheet_by_program:
            record_sheet_by_program[program] = record_sheet_structure_for_program(program)

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
        "course_groups": course_groups,
        "default_program": default_program,
        "default_batch_id": default_batch_id,
        "competencies_by_program": competencies_by_program,
        "encodable_by_program": encodable_by_program,
        "non_encodable_by_program": non_encodable_by_program,
        "record_sheet_by_program": record_sheet_by_program,
        "learning_outcomes": all_learning_outcomes or SAMPLE_LEARNING_OUTCOMES,
        "passing_average": 75,
    }
