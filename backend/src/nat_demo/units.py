"""Unit conversion at the configuration and presentation boundaries."""

NM_M = 1852.0
FT_M = 0.3048
KNOT_MS = NM_M / 3600.0
EARTH_RADIUS_M = 6_371_008.8


def nm_to_m(value: float) -> float:
    return value * NM_M


def fl_to_m(value: float) -> float:
    return value * 100.0 * FT_M


def m_to_fl(value: float) -> float:
    return value / (100.0 * FT_M)
