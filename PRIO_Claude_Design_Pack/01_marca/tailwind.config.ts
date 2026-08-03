import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        // shadcn/ui tokens — wired via CSS variables
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // PRIO brand palette — preserved from v1
        prio: {
          green: "#4FC38A",
          coral: "#F27D72",
          blue: "#5BA7D1",
          purple: "#9B7EDC",
        },
        // Surface tokens — used across the app shell.
        // Wired a CSS variables para que cambien automaticamente en
        // dark mode (mig dark mode v2). El formato `rgb(... / <alpha-value>)`
        // permite usar las clases /N de Tailwind (bg-surface/70).
        surface: {
          DEFAULT: "rgb(var(--surface-rgb) / <alpha-value>)",
          muted: "rgb(var(--surface-muted-rgb) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle-rgb) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink-rgb) / <alpha-value>)",
          soft: "rgb(var(--ink-soft-rgb) / <alpha-value>)",
          muted: "rgb(var(--ink-muted-rgb) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--line-rgb) / <alpha-value>)",
          strong: "rgb(var(--line-strong-rgb) / <alpha-value>)",
        },
        // Per-space accent tokens (Pendientes/Personal/Casa/Trabajo)
        space: {
          pendientes: {
            primary: "#5BA7D1",
            soft: "#F2F9FE",
            "soft-strong": "#E8F4FB",
            border: "#DCE9F4",
          },
          personal: {
            primary: "#9B7EDC",
            soft: "#F7F3FE",
            "soft-strong": "#EFE7FC",
            border: "#E8DDF7",
          },
          casa: {
            primary: "#4FC38A",
            soft: "#F2FBF6",
            "soft-strong": "#E4F6EC",
            border: "#DCEFE5",
          },
          trabajo: {
            primary: "#F27D72",
            soft: "#FFF5F3",
            "soft-strong": "#FDEAE6",
            border: "#F6E0DB",
          },
        },
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "16px",
        "2xl": "20px",
        "3xl": "24px",
      },
      boxShadow: {
        soft: "0 8px 20px rgba(15, 23, 42, 0.045)",
        elevated: "0 14px 36px rgba(15, 23, 42, 0.06)",
        glass: "0 8px 30px rgba(15, 23, 42, 0.04)",
      },
      backgroundImage: {
        "shell-pendientes":
          "radial-gradient(circle at top left, rgba(255,255,255,1), rgba(245,249,252,1) 36%, rgba(244,247,248,1) 100%)",
        "shell-personal":
          "radial-gradient(circle at top left, rgba(255,255,255,1), rgba(249,246,255,1) 36%, rgba(244,247,248,1) 100%)",
        "shell-casa":
          "radial-gradient(circle at top left, rgba(255,255,255,1), rgba(247,252,249,1) 36%, rgba(244,247,248,1) 100%)",
        "shell-trabajo":
          "radial-gradient(circle at top left, rgba(255,255,255,1), rgba(255,248,246,1) 36%, rgba(244,247,248,1) 100%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
