"""Default master data when no DB records exist yet."""

from decimal import Decimal

DEFAULT_FISCAL_YEAR_LABEL = "2025–2026"
DEFAULT_REGISTRATION_FEE = Decimal("500.00")
REGISTRATION_FEE_LABEL = "Registration Fee"

DEFAULT_PROGRAMS: tuple[tuple[str, Decimal, int], ...] = (
    ("Automotive Servicing NC I", Decimal("1141.00"), 1),
    ("Automotive Servicing (Engine Repair) NC II", Decimal("1300.00"), 2),
    ("Driving NC II", Decimal("1034.00"), 3),
    ("Driving NC III (Passenger Bus / Straight Truck)", Decimal("2164.00"), 4),
    ("Rice Machinery Operations NC II", Decimal("1323.00"), 5),
)

# Alternate spellings from forms / legacy data
PROGRAM_ALIASES: dict[str, str] = {
    "automotive servicing nc1": "Automotive Servicing NC I",
    "automotive servicing nc i": "Automotive Servicing NC I",
    "automotive servicing (engine repair) nc2": "Automotive Servicing (Engine Repair) NC II",
    "automotive servicing (engine repair) nc ii": "Automotive Servicing (Engine Repair) NC II",
    "driving nc2": "Driving NC II",
    "driving nc ii": "Driving NC II",
    "driving (passenger bus/straight truck) nc3": "Driving NC III (Passenger Bus / Straight Truck)",
    "driving nc iii (passenger bus / straight truck)": "Driving NC III (Passenger Bus / Straight Truck)",
    "rice machinery operations nc2 (full qualification)": "Rice Machinery Operations NC II",
    "rice machinery operations nc ii (full qualification)": "Rice Machinery Operations NC II",
    "rice machinery operations nc2": "Rice Machinery Operations NC II",
}

DEFAULT_SCHEDULES: tuple[tuple[str, str, str, str, int], ...] = (
    ("Mondays - Fridays (8am - 5pm)", "mon_fri_8_5", "Mondays - Fridays", "8:00 AM - 5:00 PM", 1),
    ("Saturdays - Sundays (8am - 5pm)", "sat_sun_8_5", "Saturdays - Sundays", "8:00 AM - 5:00 PM", 2),
    ("Mondays - Fridays (5pm - 9pm)", "mon_fri_5_9", "Mondays - Fridays", "5:00 PM - 9:00 PM", 3),
    ("Saturdays - Sundays (5pm - 9pm)", "sat_sun_5_9", "Saturdays - Sundays", "5:00 PM - 9:00 PM", 4),
)

# Standard TESDA Competency Library for Dropdown Selectors
TESDA_STANDARD_BASIC_COMPETENCIES: list[dict] = [
    {
        "code": "500311105",
        "title": "Participate in workplace communication",
        "nominal_hours": 10,
        "learning_outcomes": [
            "Obtain and convey workplace information",
            "Participate in workplace meetings and discussions",
            "Complete relevant work related documents",
        ],
    },
    {
        "code": "500311106",
        "title": "Work in team environment",
        "nominal_hours": 10,
        "learning_outcomes": [
            "Describe team role and scope",
            "Identify own role and responsibility within team",
            "Work as a team member",
        ],
    },
    {
        "code": "500311107",
        "title": "Practice career professionalism",
        "nominal_hours": 10,
        "learning_outcomes": [
            "Integrate personal objectives with organizational goals",
            "Set and meet work priorities",
            "Maintain professional growth and development",
        ],
    },
    {
        "code": "500311108",
        "title": "Practice occupational health and safety procedures",
        "nominal_hours": 10,
        "learning_outcomes": [
            "Identify hazards and risks",
            "Evaluate hazards and risks",
            "Control hazards and risks",
            "Maintain OHS awareness",
        ],
    },
    {
        "code": "500311109",
        "title": "Demonstrate work values",
        "nominal_hours": 10,
        "learning_outcomes": [
            "Define the purpose of work",
            "Apply work values/ethics",
            "Deal with ethical problems",
        ],
    },
    {
        "code": "500311110",
        "title": "Practice basic housekeeping procedures",
        "nominal_hours": 10,
        "learning_outcomes": [
            "Perform housekeeping procedures",
            "Maintain tools and equipment",
            "Follow workplace housekeeping standards",
        ],
    },
    {
        "code": "500311111",
        "title": "Solve/address general workplace problems",
        "nominal_hours": 10,
        "learning_outcomes": [
            "Identify routine problems",
            "Look for causes of routine problems",
            "Recommend solutions to problems",
        ],
    },
]

TESDA_STANDARD_COMMON_COMPETENCIES: list[dict] = [
    {
        "code": "ALT723211",
        "title": "Validate vehicle specification",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Identify vehicle specifications",
            "Validate specifications against requirements",
            "Document validation results",
        ],
    },
    {
        "code": "ALT832212",
        "title": "Move and position vehicle",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Prepare vehicle for movement",
            "Move vehicle to designated position",
            "Secure vehicle after positioning",
        ],
    },
    {
        "code": "ALT723214",
        "title": "Utilize automotive tools",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Select appropriate tools",
            "Use tools according to procedures",
            "Maintain tools after use",
        ],
    },
    {
        "code": "ALT723215",
        "title": "Perform mensuration and calculation",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Obtain measurements",
            "Perform calculations",
            "Apply results to work tasks",
        ],
    },
    {
        "code": "ALT723216",
        "title": "Utilize workshop facilities and equipment",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Prepare workshop area",
            "Operate workshop equipment",
            "Restore workshop after use",
        ],
    },
    {
        "code": "ALT723217",
        "title": "Prepare servicing parts and consumables",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Identify required parts and consumables",
            "Prepare parts for servicing",
            "Store and handle consumables safely",
        ],
    },
    {
        "code": "ALT723218",
        "title": "Prepare vehicle for servicing and releasing",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Prepare vehicle for servicing",
            "Complete pre-release checks",
            "Release vehicle to client",
        ],
    },
    {
        "code": "COM-01",
        "title": "Apply quality standards",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Assess quality of received articles",
            "Assess own work",
            "Engage in quality improvement",
        ],
    },
    {
        "code": "COM-02",
        "title": "Perform computer operations",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Plan and prepare for tasks to be undertaken",
            "Input data into computer",
            "Access information using computer",
            "Maintain computer equipment and systems",
        ],
    },
    {
        "code": "COM-03",
        "title": "Maintain an effective relationship with clients/customers",
        "nominal_hours": 20,
        "learning_outcomes": [
            "Maintain a clean and hygienic environment",
            "Meet client/customer requirements",
            "Build credibility with customers/clients",
        ],
    },
]

# Initial competencies seeded for existing default programs
DEFAULT_PROGRAM_COMPETENCIES: dict[str, dict[str, list[dict]]] = {
    "Automotive Servicing NC I": {
        "basic": [
            {"code": "500311105", "title": "Participate in workplace communication", "nominal_hours": 10},
            {"code": "500311106", "title": "Work in team environment", "nominal_hours": 10},
            {"code": "500311109", "title": "Demonstrate work values", "nominal_hours": 10},
            {"code": "500311110", "title": "Practice basic housekeeping procedures", "nominal_hours": 10},
        ],
        "common": [
            {"code": "ALT723211", "title": "Validate vehicle specification", "nominal_hours": 20},
            {"code": "ALT832212", "title": "Move and position vehicle", "nominal_hours": 20},
            {"code": "ALT723214", "title": "Utilize automotive tools", "nominal_hours": 20},
            {"code": "ALT723215", "title": "Perform mensuration and calculation", "nominal_hours": 20},
            {"code": "ALT723216", "title": "Utilize workshop facilities and equipment", "nominal_hours": 20},
            {"code": "ALT723217", "title": "Prepare servicing parts and consumables", "nominal_hours": 20},
            {"code": "ALT723218", "title": "Prepare vehicle for servicing and releasing", "nominal_hours": 20},
        ],
        "core": [
            {"code": "ALT723376", "title": "Perform pre-delivery inspection", "nominal_hours": 40},
            {"code": "ALT723377", "title": "Perform periodic maintenance of automotive engine", "nominal_hours": 40},
            {"code": "ALT723378", "title": "Perform periodic maintenance of drive train", "nominal_hours": 40},
            {"code": "ALT723379", "title": "Perform periodic maintenance of brake system", "nominal_hours": 40},
            {"code": "ALT723380", "title": "Perform periodic maintenance of suspension system", "nominal_hours": 40},
            {"code": "ALT723381", "title": "Perform periodic maintenance of steering system", "nominal_hours": 40},
        ],
    },
    "Automotive Servicing (Engine Repair) NC II": {
        "basic": [
            {"code": "500311105", "title": "Participate in workplace communication", "nominal_hours": 10},
            {"code": "500311106", "title": "Work in team environment", "nominal_hours": 10},
            {"code": "500311107", "title": "Practice career professionalism", "nominal_hours": 10},
            {"code": "500311108", "title": "Practice occupational health and safety procedures", "nominal_hours": 10},
        ],
        "common": [
            {"code": "COM-01", "title": "Apply quality standards", "nominal_hours": 20},
            {"code": "COM-02", "title": "Perform computer operations", "nominal_hours": 20},
            {"code": "ALT723215", "title": "Perform mensuration and calculation", "nominal_hours": 20},
            {"code": "ALT723217", "title": "Prepare servicing parts and consumables", "nominal_hours": 20},
        ],
        "core": [
            {"code": "ALT723301", "title": "Diagnose engine mechanical problems", "nominal_hours": 40},
            {"code": "ALT723302", "title": "Overhaul gasoline engine", "nominal_hours": 50},
            {"code": "ALT723303", "title": "Overhaul diesel engine", "nominal_hours": 50},
            {"code": "ALT723304", "title": "Perform engine tune-up", "nominal_hours": 40},
            {"code": "ALT723305", "title": "Perform engine timing adjustment", "nominal_hours": 40},
        ],
    },
    "Driving NC II": {
        "basic": [
            {"code": "500311105", "title": "Participate in workplace communication", "nominal_hours": 10},
            {"code": "500311106", "title": "Work in team environment", "nominal_hours": 10},
            {"code": "500311107", "title": "Practice career professionalism", "nominal_hours": 10},
            {"code": "500311108", "title": "Practice occupational health and safety procedures", "nominal_hours": 10},
        ],
        "common": [
            {"code": "COM-01", "title": "Apply quality standards", "nominal_hours": 20},
            {"code": "COM-02", "title": "Perform computer operations", "nominal_hours": 20},
            {"code": "COM-03", "title": "Maintain an effective relationship with clients/customers", "nominal_hours": 20},
        ],
        "core": [
            {"code": "DRV723301", "title": "Carry out vehicle pre- and post-operation procedures", "nominal_hours": 30},
            {"code": "DRV723302", "title": "Obey and observe traffic rules and regulations", "nominal_hours": 30},
            {"code": "DRV723303", "title": "Implement and practice defensive driving", "nominal_hours": 40},
            {"code": "DRV723304", "title": "Perform basic vehicle troubleshooting", "nominal_hours": 30},
            {"code": "DRV723305", "title": "Perform minor vehicle maintenance", "nominal_hours": 30},
        ],
    },
    "Driving NC III (Passenger Bus / Straight Truck)": {
        "basic": [
            {"code": "500311105", "title": "Participate in workplace communication", "nominal_hours": 10},
            {"code": "500311106", "title": "Work in team environment", "nominal_hours": 10},
            {"code": "500311107", "title": "Practice career professionalism", "nominal_hours": 10},
            {"code": "500311108", "title": "Practice occupational health and safety procedures", "nominal_hours": 10},
        ],
        "common": [
            {"code": "COM-01", "title": "Apply quality standards", "nominal_hours": 20},
            {"code": "COM-02", "title": "Perform computer operations", "nominal_hours": 20},
            {"code": "COM-03", "title": "Maintain an effective relationship with clients/customers", "nominal_hours": 20},
        ],
        "core": [
            {"code": "DRV723311", "title": "Perform pre- and post-operation for heavy vehicle / bus", "nominal_hours": 40},
            {"code": "DRV723312", "title": "Drive passenger bus / straight truck defensively", "nominal_hours": 60},
            {"code": "DRV723313", "title": "Manage passenger safety and cargo handling", "nominal_hours": 30},
            {"code": "DRV723314", "title": "Perform emergency maneuvers and heavy vehicle troubleshooting", "nominal_hours": 40},
            {"code": "DRV723315", "title": "Service air brake and pneumatic systems", "nominal_hours": 40},
        ],
    },
    "Rice Machinery Operations NC II": {
        "basic": [
            {"code": "500311105", "title": "Participate in workplace communication", "nominal_hours": 10},
            {"code": "500311106", "title": "Work in team environment", "nominal_hours": 10},
            {"code": "500311107", "title": "Practice career professionalism", "nominal_hours": 10},
            {"code": "500311108", "title": "Practice occupational health and safety procedures", "nominal_hours": 10},
        ],
        "common": [
            {"code": "COM-01", "title": "Apply quality standards", "nominal_hours": 20},
            {"code": "COM-02", "title": "Perform computer operations", "nominal_hours": 20},
            {"code": "ALT723215", "title": "Perform mensuration and calculation", "nominal_hours": 20},
        ],
        "core": [
            {"code": "RMO723301", "title": "Perform pre-operation inspection of rice machinery", "nominal_hours": 30},
            {"code": "RMO723302", "title": "Operate walk-behind and riding rice transplanter", "nominal_hours": 40},
            {"code": "RMO723303", "title": "Operate combine harvester and thresher", "nominal_hours": 50},
            {"code": "RMO723304", "title": "Perform post-operation cleaning and grain handling", "nominal_hours": 30},
            {"code": "RMO723305", "title": "Perform preventive maintenance of rice machinery", "nominal_hours": 40},
        ],
    },
}

