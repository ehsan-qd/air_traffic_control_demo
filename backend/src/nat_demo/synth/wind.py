import numpy as np

from nat_demo.config import DemoConfig
from nat_demo.units import KNOT_MS


class SyntheticWind:
    def __init__(self, config: DemoConfig, rng: np.random.Generator):
        self.config = config
        self.phase = rng.uniform(0, 2 * np.pi, size=3)

    def centre(self, lon, t_s=0):
        w = self.config.wind
        lo, hi = self.config.airspace.lon_range_deg
        phase = (
            w.meander_wavenumber * np.pi * (np.asarray(lon) - lo) / (hi - lo)
            - w.drift_deg_per_hour * t_s / 3600 * np.pi / (hi - lo)
            - 0.5
        )
        return w.jet_lat_deg + w.meander_amp_deg * np.sin(phase) + 0.06 * (np.asarray(lon) - lo)

    def wind_uv(self, lon_deg, lat_deg, fl, t_s=0):
        w = self.config.wind
        lon, lat, level = np.broadcast_arrays(lon_deg, lat_deg, fl)
        lo, hi = self.config.airspace.lon_range_deg
        phase = (
            w.meander_wavenumber * np.pi * (lon - lo) / (hi - lo)
            - w.drift_deg_per_hour * t_s / 3600 * np.pi / (hi - lo)
            - 0.5
        )
        centre = self.centre(lon, t_s)
        speed = w.background_westerly_kt + w.jet_core_kt * np.exp(
            -(((lat - centre) / w.jet_width_deg) ** 2)
        ) * np.exp(-(((level - w.level_peak_fl) / w.level_width_fl) ** 2))
        psi = np.arctan2(
            w.meander_amp_deg * np.cos(phase) * w.meander_wavenumber * np.pi / (hi - lo) + 0.06,
            np.cos(np.deg2rad(lat)),
        )
        noise = sum(1.7 * np.sin((i + 1) * (lon / 12 + lat / 15) + self.phase[i]) for i in range(3))
        return (speed * np.cos(psi) + noise) * KNOT_MS, (
            speed * np.sin(psi) + 0.3 * noise
        ) * KNOT_MS

    def grid(self, t_s: float):
        lo, hi = self.config.airspace.lon_range_deg
        la, lb = self.config.airspace.lat_range_deg
        lon, lat = np.meshgrid(np.linspace(lo, hi, 61), np.linspace(la, lb, 27))
        u, v = self.wind_uv(lon, lat, 350, t_s)
        return {
            "time_s": t_s,
            "level_fl": 350,
            "width": 61,
            "height": 27,
            "bounds": [lo, la, hi, lb],
            "u_ms": u.ravel().tolist(),
            "v_ms": v.ravel().tolist(),
        }
