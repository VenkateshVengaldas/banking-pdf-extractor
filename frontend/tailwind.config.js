/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f0f4ff",
          100: "#dde6ff",
          200: "#c2d0ff",
          300: "#96adff",
          400: "#6380ff",
          500: "#3d55f5",
          600: "#2a38eb",
          700: "#2028d0",
          800: "#2125a8",
          900: "#1e2185",
          950: "#141559",
        },
      },
    },
  },
  plugins: [],
};
