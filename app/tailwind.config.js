// app/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--bg)',
        card: 'var(--card)',
        card2: 'var(--card-2)',
        'border-col': 'var(--border)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        bull: 'var(--green)',
        bear: 'var(--red)',
        caution: 'var(--yellow)',
        accent: 'var(--blue)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
