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

