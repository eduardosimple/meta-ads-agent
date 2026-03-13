import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        meta: {
          blue: "#1877f2",
          green: "#42b72a",
          "blue-dark": "#1565d8",
          "green-dark": "#36a420",
        },
      },
      backgroundImage: {
        "meta-gradient": "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)",
        "meta-gradient-hover":
          "linear-gradient(135deg, #1565d8 0%, #36a420 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
