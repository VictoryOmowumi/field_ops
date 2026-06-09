// Tenant color preset registry.
// Each preset overrides only the CSS variables that carry the accent/brand color.
// Background, foreground, muted, border, and radius remain unchanged —
// so the brand feels different without breaking the layout or legibility.
//
// Values are in OKLCH to match globals.css. "default" is null — no style tag
// is injected, meaning globals.css values win (IMINNDX's warm-orange theme).
//
// Hue reference:
//   264 = corporate blue (#2563EB / Tailwind blue-600 family)
//   142 = corporate green (#16A34A / Tailwind green-600 family)
//   293 = violet/purple (#7C3AED / Tailwind violet-600 family)
//   220 = slate-blue (#475569 / Tailwind slate family, desaturated)
//    25 = bold red (#DC2626 / Tailwind red-600 family)
//   180 = teal (#0D9488 / Tailwind teal-600 family)
//    65 = amber/gold (#D97706 / Tailwind amber-600 family)
//    15 = rose/pink (#E11D48 / Tailwind rose-600 family)
//   210 = navy (#1E3A5F / deep navy, low saturation)

type ColorVars = Partial<Record<string, string>>;
type ColorPresetEntry = { light: ColorVars; dark: ColorVars };

export const COLOR_PRESET_REGISTRY: Record<string, ColorPresetEntry | null> = {
  // No override — globals.css warm-orange theme applies
  default: null,

  // Standard corporate blue (#2563EB family)
  blue: {
    light: {
      "--primary":            "oklch(0.546 0.216 264)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.546 0.216 264)",
      "--chart-1":            "oklch(0.546 0.216 264)",
      "--chart-5":            "oklch(0.420 0.188 264)",
      "--sidebar-primary":    "oklch(0.546 0.216 264)",
      "--sidebar-primary-foreground": "oklch(1.000 0 0)",
    },
    dark: {
      "--primary":            "oklch(0.623 0.218 264)",
      "--primary-foreground": "oklch(0.120 0.012 264)",
      "--ring":               "oklch(0.623 0.218 264)",
      "--chart-1":            "oklch(0.580 0.200 264)",
      "--chart-5":            "oklch(0.440 0.168 264)",
      "--sidebar-primary":    "oklch(0.623 0.218 264)",
      "--sidebar-primary-foreground": "oklch(0.120 0.012 264)",
    },
  },

  // Corporate green (#16A34A family)
  green: {
    light: {
      "--primary":            "oklch(0.548 0.160 142)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.548 0.160 142)",
      "--chart-1":            "oklch(0.548 0.160 142)",
      "--chart-5":            "oklch(0.420 0.138 142)",
    },
    dark: {
      "--primary":            "oklch(0.620 0.170 142)",
      "--primary-foreground": "oklch(0.100 0.020 142)",
      "--ring":               "oklch(0.620 0.170 142)",
      "--chart-1":            "oklch(0.580 0.158 142)",
      "--chart-5":            "oklch(0.450 0.138 142)",
    },
  },

  // Violet/purple (#7C3AED family)
  purple: {
    light: {
      "--primary":            "oklch(0.520 0.250 293)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.520 0.250 293)",
      "--chart-1":            "oklch(0.520 0.250 293)",
      "--chart-5":            "oklch(0.400 0.210 293)",
    },
    dark: {
      "--primary":            "oklch(0.618 0.238 293)",
      "--primary-foreground": "oklch(0.100 0.015 293)",
      "--ring":               "oklch(0.618 0.238 293)",
      "--chart-1":            "oklch(0.575 0.220 293)",
      "--chart-5":            "oklch(0.440 0.185 293)",
    },
  },

  // Desaturated slate-blue (understated, very corporate)
  slate: {
    light: {
      "--primary":            "oklch(0.456 0.090 220)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.456 0.090 220)",
      "--chart-1":            "oklch(0.456 0.090 220)",
      "--chart-5":            "oklch(0.360 0.075 220)",
    },
    dark: {
      "--primary":            "oklch(0.580 0.095 220)",
      "--primary-foreground": "oklch(0.100 0.010 220)",
      "--ring":               "oklch(0.580 0.095 220)",
      "--chart-1":            "oklch(0.540 0.088 220)",
      "--chart-5":            "oklch(0.420 0.070 220)",
    },
  },

  // Bold red (#DC2626 family)
  red: {
    light: {
      "--primary":            "oklch(0.530 0.215 25)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.530 0.215 25)",
      "--chart-1":            "oklch(0.530 0.215 25)",
      "--chart-5":            "oklch(0.420 0.190 25)",
      "--sidebar-primary":    "oklch(0.530 0.215 25)",
      "--sidebar-primary-foreground": "oklch(1.000 0 0)",
    },
    dark: {
      "--primary":            "oklch(0.620 0.210 25)",
      "--primary-foreground": "oklch(0.100 0.015 25)",
      "--ring":               "oklch(0.620 0.210 25)",
      "--chart-1":            "oklch(0.580 0.195 25)",
      "--chart-5":            "oklch(0.450 0.170 25)",
      "--sidebar-primary":    "oklch(0.620 0.210 25)",
      "--sidebar-primary-foreground": "oklch(0.100 0.015 25)",
    },
  },

  // Teal (#0D9488 family)
  teal: {
    light: {
      "--primary":            "oklch(0.560 0.130 180)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.560 0.130 180)",
      "--chart-1":            "oklch(0.560 0.130 180)",
      "--chart-5":            "oklch(0.430 0.110 180)",
      "--sidebar-primary":    "oklch(0.560 0.130 180)",
      "--sidebar-primary-foreground": "oklch(1.000 0 0)",
    },
    dark: {
      "--primary":            "oklch(0.640 0.135 180)",
      "--primary-foreground": "oklch(0.100 0.015 180)",
      "--ring":               "oklch(0.640 0.135 180)",
      "--chart-1":            "oklch(0.600 0.125 180)",
      "--chart-5":            "oklch(0.460 0.105 180)",
      "--sidebar-primary":    "oklch(0.640 0.135 180)",
      "--sidebar-primary-foreground": "oklch(0.100 0.015 180)",
    },
  },

  // Amber / Gold (#D97706 family)
  amber: {
    light: {
      "--primary":            "oklch(0.660 0.175 65)",
      "--primary-foreground": "oklch(0.100 0.020 65)",
      "--ring":               "oklch(0.660 0.175 65)",
      "--chart-1":            "oklch(0.660 0.175 65)",
      "--chart-5":            "oklch(0.520 0.148 65)",
      "--sidebar-primary":    "oklch(0.660 0.175 65)",
      "--sidebar-primary-foreground": "oklch(0.100 0.020 65)",
    },
    dark: {
      "--primary":            "oklch(0.740 0.170 65)",
      "--primary-foreground": "oklch(0.100 0.020 65)",
      "--ring":               "oklch(0.740 0.170 65)",
      "--chart-1":            "oklch(0.700 0.162 65)",
      "--chart-5":            "oklch(0.560 0.140 65)",
      "--sidebar-primary":    "oklch(0.740 0.170 65)",
      "--sidebar-primary-foreground": "oklch(0.100 0.020 65)",
    },
  },

  // Rose / Pink (#E11D48 family)
  rose: {
    light: {
      "--primary":            "oklch(0.540 0.230 15)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.540 0.230 15)",
      "--chart-1":            "oklch(0.540 0.230 15)",
      "--chart-5":            "oklch(0.420 0.195 15)",
      "--sidebar-primary":    "oklch(0.540 0.230 15)",
      "--sidebar-primary-foreground": "oklch(1.000 0 0)",
    },
    dark: {
      "--primary":            "oklch(0.630 0.220 15)",
      "--primary-foreground": "oklch(0.100 0.015 15)",
      "--ring":               "oklch(0.630 0.220 15)",
      "--chart-1":            "oklch(0.590 0.205 15)",
      "--chart-5":            "oklch(0.460 0.175 15)",
      "--sidebar-primary":    "oklch(0.630 0.220 15)",
      "--sidebar-primary-foreground": "oklch(0.100 0.015 15)",
    },
  },

  // Deep Navy (low-saturation, very formal)
  navy: {
    light: {
      "--primary":            "oklch(0.360 0.095 220)",
      "--primary-foreground": "oklch(1.000 0 0)",
      "--ring":               "oklch(0.360 0.095 220)",
      "--chart-1":            "oklch(0.360 0.095 220)",
      "--chart-5":            "oklch(0.280 0.075 220)",
      "--sidebar-primary":    "oklch(0.360 0.095 220)",
      "--sidebar-primary-foreground": "oklch(1.000 0 0)",
    },
    dark: {
      "--primary":            "oklch(0.500 0.100 220)",
      "--primary-foreground": "oklch(0.950 0.005 220)",
      "--ring":               "oklch(0.500 0.100 220)",
      "--chart-1":            "oklch(0.470 0.092 220)",
      "--chart-5":            "oklch(0.360 0.075 220)",
      "--sidebar-primary":    "oklch(0.500 0.100 220)",
      "--sidebar-primary-foreground": "oklch(0.950 0.005 220)",
    },
  },
};
