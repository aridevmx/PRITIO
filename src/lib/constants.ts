export const IS_SELF_HOSTED = import.meta.env.VITE_SELF_HOSTED === "true";

export const DONATION_LINKS = {
  github: import.meta.env.VITE_DONATION_GITHUB ?? "",
  paypal: import.meta.env.VITE_DONATION_PAYPAL ?? "",
  buymeacoffee: import.meta.env.VITE_DONATION_BUYMEACOFFEE ?? "",
  stripe: import.meta.env.VITE_DONATION_STRIPE ?? "",
} as const;
