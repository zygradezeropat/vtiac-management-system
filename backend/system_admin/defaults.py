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

# Standard TESDA Core Competency Library for Dropdown Selectors
TESDA_STANDARD_CORE_COMPETENCIES: list[dict] = [
    # Automotive Servicing
    {
        "code": "ALT723376",
        "title": "Perform pre-delivery inspection",
        "nominal_hours": 40,
        "learning_outcomes": ["Inspect vehicle exterior and interior", "Check fluid levels and under-chassis", "Perform road testing and reporting"],
    },
    {
        "code": "ALT723377",
        "title": "Perform periodic maintenance of automotive engine",
        "nominal_hours": 40,
        "learning_outcomes": ["Inspect and clean engine components", "Replace engine oil and filters", "Inspect and adjust belts and hoses"],
    },
    {
        "code": "ALT723378",
        "title": "Perform periodic maintenance of drive train",
        "nominal_hours": 40,
        "learning_outcomes": ["Check clutch and transmission operation", "Inspect drive shaft and differential", "Replace drive train lubricants"],
    },
    {
        "code": "ALT723379",
        "title": "Perform periodic maintenance of brake system",
        "nominal_hours": 40,
        "learning_outcomes": ["Inspect brake pads, linings, and discs", "Bleed hydraulic brake lines", "Adjust parking brake"],
    },
    {
        "code": "ALT723380",
        "title": "Perform periodic maintenance of suspension system",
        "nominal_hours": 40,
        "learning_outcomes": ["Inspect shock absorbers and struts", "Inspect ball joints and bushings", "Verify wheel alignment"],
    },
    {
        "code": "ALT723381",
        "title": "Perform periodic maintenance of steering system",
        "nominal_hours": 40,
        "learning_outcomes": ["Inspect steering gearbox and linkage", "Check power steering fluid and pump", "Test steering play and responsiveness"],
    },
    {
        "code": "ALT723301",
        "title": "Diagnose engine mechanical problems",
        "nominal_hours": 40,
        "learning_outcomes": ["Perform compression test", "Inspect cylinder head and block", "Analyze engine noise and vibrations"],
    },
    {
        "code": "ALT723302",
        "title": "Overhaul gasoline engine",
        "nominal_hours": 50,
        "learning_outcomes": ["Disassemble engine components", "Measure and machine worn parts", "Reassemble and test overhauled engine"],
    },
    {
        "code": "ALT723303",
        "title": "Overhaul diesel engine",
        "nominal_hours": 50,
        "learning_outcomes": ["Disassemble diesel fuel injectors and pump", "Inspect cylinders and pistons", "Reassemble and calibrate diesel engine"],
    },
    {
        "code": "ALT723304",
        "title": "Perform engine tune-up",
        "nominal_hours": 40,
        "learning_outcomes": ["Inspect and adjust spark plugs and ignition", "Clean fuel injectors / carburetor", "Set idle speed and ignition timing"],
    },
    # Driving
    {
        "code": "DRV723301",
        "title": "Carry out vehicle pre- and post-operation procedures",
        "nominal_hours": 30,
        "learning_outcomes": ["Inspect BLOWBAGETS before driving", "Verify vehicle gauges and instruments", "Perform post-trip maintenance check"],
    },
    {
        "code": "DRV723302",
        "title": "Obey and observe traffic rules and regulations",
        "nominal_hours": 30,
        "learning_outcomes": ["Interpret traffic signs and pavement markings", "Observe speed limits and right-of-way", "Follow traffic officer instructions"],
    },
    {
        "code": "DRV723303",
        "title": "Implement and practice defensive driving",
        "nominal_hours": 40,
        "learning_outcomes": ["Anticipate driving hazards", "Maintain safe following distances", "Execute emergency maneuvers"],
    },
    {
        "code": "DRV723304",
        "title": "Perform basic vehicle troubleshooting",
        "nominal_hours": 30,
        "learning_outcomes": ["Diagnose engine overheating and flat tires", "Jumpstart drained battery safely", "Replace vehicle fuses and bulbs"],
    },
    {
        "code": "DRV723305",
        "title": "Perform minor vehicle maintenance",
        "nominal_hours": 30,
        "learning_outcomes": ["Top up engine oil and coolant", "Check tire pressure and tread depth", "Clean vehicle exterior and cabin"],
    },
    {
        "code": "DRV723311",
        "title": "Perform pre- and post-operation for heavy vehicle / bus",
        "nominal_hours": 40,
        "learning_outcomes": ["Inspect pneumatic and air brake systems", "Check commercial vehicle lighting and couplings", "Complete driver logbook and trip report"],
    },
    {
        "code": "DRV723312",
        "title": "Drive passenger bus / straight truck defensively",
        "nominal_hours": 60,
        "learning_outcomes": ["Maneuver heavy vehicle in city traffic", "Execute reversing and dock parking", "Navigate mountain terrain and slippery roads"],
    },
    # Rice Machinery Operations
    {
        "code": "RMO723301",
        "title": "Perform pre-operation inspection of rice machinery",
        "nominal_hours": 30,
        "learning_outcomes": ["Inspect engine oil and hydraulic levels", "Check belts, chains, and cutting blades", "Inspect safety shields and attachments"],
    },
    {
        "code": "RMO723302",
        "title": "Operate walk-behind and riding rice transplanter",
        "nominal_hours": 40,
        "learning_outcomes": ["Prepare seedling trays for loading", "Adjust transplanting depth and hill spacing", "Operate transplanter in puddled field"],
    },
    {
        "code": "RMO723303",
        "title": "Operate combine harvester and thresher",
        "nominal_hours": 50,
        "learning_outcomes": ["Configure cutter bar and reel speed", "Operate harvester in field conditions", "Unload clean grain into transport vehicle"],
    },
    {
        "code": "RMO723304",
        "title": "Perform post-operation cleaning and grain handling",
        "nominal_hours": 30,
        "learning_outcomes": ["Clean grain tank, sieves, and augers", "Store machinery in shed", "Apply anti-rust coating to metal parts"],
    },
    # Shielded Metal Arc Welding (SMAW / Welding NC II)
    {
        "code": "MEE721301",
        "title": "Weld carbon steel plates using SMAW in 1G position",
        "nominal_hours": 40,
        "learning_outcomes": ["Perform root pass weld", "Perform hot pass and fill passes", "Perform capping pass in flat position"],
    },
    {
        "code": "MEE721302",
        "title": "Weld carbon steel plates using SMAW in 2G position",
        "nominal_hours": 40,
        "learning_outcomes": ["Fit up plates horizontally", "Deposit root bead and filler beads", "Inspect horizontal weld profile"],
    },
    {
        "code": "MEE721303",
        "title": "Weld carbon steel plates using SMAW in 3G position",
        "nominal_hours": 50,
        "learning_outcomes": ["Set up plates in vertical position", "Perform uphill weld passes", "Perform visual and bend testing"],
    },
    {
        "code": "MEE721304",
        "title": "Weld carbon steel plates using SMAW in 4G position",
        "nominal_hours": 50,
        "learning_outcomes": ["Tack weld overhead plate joint", "Control arc puddle in overhead position", "Clean slag and grind defects"],
    },
    # Electrical Installation & Maintenance (EIM NC II)
    {
        "code": "EIM723301",
        "title": "Install electrical metallic/non-metallic conduit",
        "nominal_hours": 40,
        "learning_outcomes": ["Bend electrical conduits using bender", "Install junction boxes and utility boxes", "Support and fasten conduit runs"],
    },
    {
        "code": "EIM723302",
        "title": "Wire electrical devices and fixtures",
        "nominal_hours": 40,
        "learning_outcomes": ["Pull conductors through conduits", "Connect switches, duplex receptacles, and lamps", "Perform continuity and insulation test"],
    },
    {
        "code": "EIM723303",
        "title": "Install electrical protection and distribution panel",
        "nominal_hours": 40,
        "learning_outcomes": ["Mount circuit breaker panelboard", "Terminate branch circuit conductors", "Test ground fault and overcurrent protection"],
    },
    # Computer Systems Servicing (CSS NC II)
    {
        "code": "ICT311301",
        "title": "Install and configure computer systems",
        "nominal_hours": 40,
        "learning_outcomes": ["Assemble computer hardware components", "Install operating system and device drivers", "Configure application software and BIOS"],
    },
    {
        "code": "ICT311302",
        "title": "Set up computer networks",
        "nominal_hours": 40,
        "learning_outcomes": ["Fabricate UTP network cables (T568A/B)", "Configure router, switch, and IP addresses", "Set up network file sharing and security"],
    },
    {
        "code": "ICT311303",
        "title": "Set up computer servers",
        "nominal_hours": 50,
        "learning_outcomes": ["Install server operating system", "Configure DHCP, DNS, and Active Directory", "Configure user accounts and access permissions"],
    },
    # Cookery & Bread and Pastry Production
    {
        "code": "CKR723301",
        "title": "Clean and maintain kitchen premises",
        "nominal_hours": 20,
        "learning_outcomes": ["Sanitize food contact surfaces", "Maintain commercial kitchen equipment", "Follow food safety regulations"],
    },
    {
        "code": "CKR723302",
        "title": "Prepare stocks, sauces and soups",
        "nominal_hours": 30,
        "learning_outcomes": ["Prepare white and brown stocks", "Prepare mother sauces and derivative sauces", "Prepare clear and thick soups"],
    },
    {
        "code": "CKR723303",
        "title": "Prepare meat and poultry dishes",
        "nominal_hours": 40,
        "learning_outcomes": ["Select and fabricate cuts of meat", "Apply dry and moist heat cooking methods", "Plate and present meat dishes with garnishes"],
    },
    {
        "code": "BPP723301",
        "title": "Prepare and produce bakery products",
        "nominal_hours": 40,
        "learning_outcomes": ["Weigh and measure baking ingredients accurately", "Prepare yeast doughs and breads", "Bake and store bakery items"],
    },
    {
        "code": "BPP723302",
        "title": "Prepare and produce pastry products",
        "nominal_hours": 40,
        "learning_outcomes": ["Prepare short crust and puff pastry", "Prepare sweet fillings and toppings", "Bake and decorate pastry products"],
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

