/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Cada color apunta a una variable CSS declarada en src/styles/globals.css.
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        tertiary: 'var(--color-tertiary)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        success: 'var(--color-success)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        foreground: 'var(--color-text)',
        muted: 'var(--color-muted)',
        line: 'var(--color-border)',
      },
      // Tipografías y tamaño base también vienen de variables CSS.
      fontFamily: {
        primary: ['var(--font-primary)'],
        secondary: ['var(--font-secondary)'],
      },
      fontSize: {
        base: ['var(--font-size-base)', { lineHeight: '1.6' }],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 12px 32px -20px rgb(15 23 42 / 0.35)',
      },
    },
  },
  plugins: [],
};
