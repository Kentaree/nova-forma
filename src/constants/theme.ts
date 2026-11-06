/**
 * Nova Forma palette ("Thermal Tangerine"), from the smart-fitness brand doc.
 * The app is dark-first; a light variant is provided for people who run their phone in light mode.
 */
type PaletteKey =
  | 'background' | 'surface' | 'surfaceRaised' | 'border' | 'text' | 'textSecondary' | 'accent' | 'onAccent' | 'danger';
export type Palette = Record<PaletteKey, string>;

export const Colors: { dark: Palette; light: Palette } = {
  dark: {
    background: '#121212', // Carbon
    surface: '#27272A', // Onyx
    surfaceRaised: '#323236',
    border: '#3F3F46',
    text: '#FFFFFF',
    textSecondary: '#A1A1AA', // Slate
    accent: '#FF5C00', // Thermal Tangerine
    onAccent: '#FFFFFF',
    danger: '#F87171',
  },
  light: {
    background: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceRaised: '#F4F4F5',
    border: '#E4E4E7',
    text: '#121212',
    textSecondary: '#52525B',
    accent: '#E65300',
    onAccent: '#FFFFFF',
    danger: '#DC2626',
  },
};

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
