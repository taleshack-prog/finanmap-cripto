import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdf4', 500: '#22c55e', 900: '#14532d' },
      }
    }
  },
  plugins: [],
}
export default config
