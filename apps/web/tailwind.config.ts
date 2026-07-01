import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'SF Pro Display', 'Inter', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
      },
      backdropBlur: {
        glass: '16px',
        'glass-sm': '12px',
      },
    },
  },
  plugins: [],
} satisfies Config
