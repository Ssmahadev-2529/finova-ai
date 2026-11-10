/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paypal: {
          darkNavy: '#001435',
          navy: '#001C64',
          deepBlue: '#003087',
          blue: '#00457C',
          brightBlue: '#0070BA',
          lightBlue: '#0079C1',
          cyan: '#00CFDE',
          yellow: '#FFC439',
          yellowHover: '#F2BA36',
          gold: '#CC9A06',
          venmo: '#008CFF',
          cardDark: '#081226',
          cardNavy: '#0C1A38',
          cardHover: '#132854',
          borderNavy: '#162F64',
          borderLight: '#1E3E85',
        },
        finova: {
          canvasDark: '#030816',
          dark: '#050B18',
          card: '#0A152E',
          cardElevated: '#0D1B3A',
          cardHover: '#10224A',
          border: '#152C5E',
          borderLight: '#1E3E85',
          borderSubtle: 'rgba(255, 255, 255, 0.08)',
          cyan: '#00CFDE',
          cyanLight: '#38EDFA',
          cyanGlow: 'rgba(0, 207, 222, 0.15)',
          blue: '#0070BA',
          blueGlow: 'rgba(0, 112, 186, 0.25)',
          accent: '#009CDE',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          muted: '#8EA1C7',
          mutedDark: '#627AAB',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace']
      },
      boxShadow: {
        'glow-paypal': '0 0 25px -3px rgba(0, 112, 186, 0.35)',
        'glow-cyan': '0 0 20px -4px rgba(0, 207, 222, 0.3)',
        'glow-yellow': '0 0 20px -4px rgba(255, 196, 57, 0.3)',
        'subtle': '0 4px 20px -2px rgba(0, 12, 36, 0.4)',
        'fintech-card': '0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 1px 3px 1px rgba(0, 0, 0, 0.03)',
        'fintech-card-hover': '0 10px 25px -5px rgba(0, 14, 45, 0.12), 0 8px 10px -6px rgba(0, 14, 45, 0.06)',
        'fintech-card-dark': '0 2px 10px 0 rgba(0, 0, 0, 0.35)',
        'fintech-card-dark-hover': '0 14px 35px -8px rgba(0, 8, 25, 0.65), 0 0 0 1px rgba(0, 207, 222, 0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.25s ease-out forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
