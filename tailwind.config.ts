import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#070609',
          900: '#0B090E', // Primary deep obsidian background
          800: '#110E14', // Secondary obsidian surface
          700: '#17131C', // Charcoal card surface
          600: '#1F1A26', // Elevated interactive surface
          500: '#2A2334', // Muted border / divider
        },
        periwinkle: {
          300: '#B4BCFF',
          400: '#9EA6FF',
          500: '#8B95FF', // Core luminous periwinkle accent
          600: '#6E78F7',
          700: '#535CE3',
        },
        emerald: {
          400: '#34D399',
          500: '#10B981', // Core emerald status/financial precision accent
          600: '#059669',
        },
        aura: {
          biter: '#F43F5E',      // Crimson alert for bite risk
          matted: '#F59E0B',     // Amber alert for matted coat
          senior: '#A855F7',     // Violet alert for senior care
          anxious: '#06B6D4',    // Cyan alert for anxious/extra care
          medical: '#EC4899',    // Pink alert for medical/heart conditions
        },
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'glass-hover': '0 14px 40px 0 rgba(139, 149, 255, 0.14), inset 0 1px 0 0 rgba(139, 149, 255, 0.28)',
        'periwinkle-glow': '0 0 28px -4px rgba(139, 149, 255, 0.45)',
        'emerald-glow': '0 0 28px -4px rgba(16, 185, 129, 0.4)',
        'biter-glow': '0 0 24px -4px rgba(244, 63, 94, 0.45)',
      },
      backgroundImage: {
        'obsidian-radial': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139, 149, 255, 0.16), rgba(11, 9, 14, 0))',
        'emerald-radial': 'radial-gradient(ellipse 60% 40% at 80% 0%, rgba(16, 185, 129, 0.11), rgba(11, 9, 14, 0))',
        'glass-gradient': 'linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 100%)',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.68' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(22px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(40px, -30px)' },
        },
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'rise-in': 'rise-in 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        drift: 'drift 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
