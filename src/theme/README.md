# Theme System Documentation

## Overview

The Pacific Disaster Platform uses a centralized theme system for all colors and visual styling. This ensures consistency, maintainability, and enables future features like dark mode and accessibility modes.

## File Structure

```
src/theme/
├── colors.ts         # Main color system (hazards, damage, UI, sectors)
├── cycloneScale.ts   # Cyclone-specific colors and scales
└── README.md         # This file
```

## Usage

### Importing Colors

```typescript
// Import specific color palettes
import { HAZARD_COLORS, BUILDING_DAMAGE_COLORS, getSectorColor } from '@/theme/colors';

// Import cyclone colors
import { getCategoryColor, WIND_RADII_COLORS } from '@/theme/colors';
```

### Common Patterns

#### Hazard Colors
```typescript
import { getHazardColor } from '@/theme/colors';

const color = getHazardColor('tropical-cyclone'); // Returns '#3B82F6'
```

#### Building Damage
```typescript
import { getBuildingDamageColor, BUILDING_DAMAGE_COLORS } from '@/theme/colors';

// By dollar amount
const color = getBuildingDamageColor(250000); // Returns severe damage color

// Direct access
const catastrophicColor = BUILDING_DAMAGE_COLORS.catastrophic;
```

#### Cyclone Categories
```typescript
import { getCategoryColor, getCategoryLabel } from '@/theme/colors';

const color = getCategoryColor(5); // Category 5 cyclone color
const label = getCategoryLabel(5); // "Category 5"
```

#### UI Colors
```typescript
import { UI_COLORS } from '@/theme/colors';

const panelBg = UI_COLORS.glassDark;
const borderColor = UI_COLORS.borderSubtle;
```

## Color Palettes

### Hazard Colors
- Wind/Cyclone: Blue (#3B82F6)
- Flood/Inundation: Cyan (#06B6D4)
- Earthquake: Red (#EF4444)
- Default: Gray (#6B7280)

### Building Damage Scale
- Minimal: Amber (#FBBF24) - < $10K
- Moderate: Orange (#F97316) - $10K-$50K
- Substantial: Dark Orange (#EA580C) - $50K-$100K
- Severe: Red (#DC2626) - $100K-$500K
- Catastrophic: Dark Red (#991B1B) - > $500K

### Cyclone Categories (Saffir-Simpson)
- Category 5: Violet (#7C3AED)
- Category 4: Red (#DC2626)
- Category 3: Orange (#FB923C)
- Category 2: Yellow (#FACC15)
- Category 1: Light Yellow (#FDE047)
- Tropical Storm: Sky Blue (#7DD3FC)

### Wind Radii
- Gale Force (34-47 kt): Gold (#FFD700)
- Storm Force (48-63 kt): Orange (#FFA500)
- Hurricane Force (≥64 kt): Red (#FF0000)

## Accessibility Features

### Color Contrast Checking
```typescript
import { hasAccessibleContrast } from '@/theme/colors';

// Check if two colors meet WCAG AA standards (4.5:1 ratio)
const isAccessible = hasAccessibleContrast('#FFFFFF', '#3B82F6');
```

### Alpha Channel Support
```typescript
import { colorWithAlpha, hexToRGBA } from '@/theme/colors';

const semiTransparent = colorWithAlpha('#3B82F6', 0.5);
// Returns: "rgba(59, 130, 246, 0.5)"
```

### Future Modes (Planned)

The theme system is designed to support:
- **Color-blind safe mode** (`CATEGORY_COLORS_COLORBLIND`)
- **High contrast mode** (`CATEGORY_COLORS_HIGH_CONTRAST`)
- **Dark mode** (all colors are already dark-mode compatible)

## Migration Guide

### Before (Hardcoded)
```typescript
// ❌ Don't do this
const markerColor = '#3B82F6';
const damageColor = lossUSD > 100000 ? '#dc2626' : '#f97316';
```

### After (Theme System)
```typescript
// ✅ Do this instead
import { HAZARD_COLORS, getBuildingDamageColor } from '@/theme/colors';

const markerColor = HAZARD_COLORS.wind;
const damageColor = getBuildingDamageColor(lossUSD);
```

## Benefits

1. **Single Source of Truth**: All colors defined in one place
2. **Easy Updates**: Change colors globally by editing theme files
3. **Consistency**: No color drift across components
4. **Accessibility**: Built-in contrast checking and color-blind safe alternatives
5. **Type Safety**: TypeScript interfaces for all color scales
6. **Future-Proof**: Ready for dark mode, custom branding, and accessibility enhancements

## Best Practices

1. **Never use hardcoded HEX values** in components
2. **Import from theme files** for all color needs
3. **Use helper functions** (e.g., `getHazardColor()`) for dynamic colors
4. **Check accessibility** with `hasAccessibleContrast()` for custom combinations
5. **Document any new colors** added to the theme system

## Color Philosophy

Our color choices follow these principles:

- **Semantic**: Colors convey meaning (red = danger/high damage, blue = water/cyclone)
- **Perceptually Uniform**: Similar data steps have similar visual steps
- **Color-Blind Safe** (Future): Alternative palettes for accessibility
- **Culturally Appropriate**: Colors respect disaster visualization conventions
