import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-jakarta)', 'sans-serif'],
      },
      colors: {
        slate: {
          850: '#151e2e',
        }
      },
      boxShadow: {
        'soft': '0 8px 30px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 20px 40px rgba(0, 0, 0, 0.06)',
      }
    },
  },
  plugins: [],
};

export default config;
