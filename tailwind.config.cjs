module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './components/**/*.{ts,tsx,js,jsx}',
    './contexts/**/*.{ts,tsx,js,jsx}',
    './lib/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        'usace-red': '#D42127',
        'usace-blue': '#003366',
        navy: {
          50: '#f0f4f8',
          100: '#dde7f0',
          200: '#c2d5e3',
          300: '#9cb9d1',
          400: '#7195b9',
          500: '#55779d',
          600: '#446184',
          700: '#3a516e',
          800: '#33455d',
          900: '#2f3d51',
          950: '#1d2635',
        },
      },
    },
  },
  plugins: [],
};
