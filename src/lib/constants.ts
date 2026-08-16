export const IS_SELF_HOSTED = import.meta.env.VITE_SELF_HOSTED === "true";

export const MEMBER_TYPE_LABELS: Record<string, string> = {
  abuelo: "Abuelo",
  abuela: "Abuela",
  mama: "Mamá",
  papa: "Papá",
  tio: "Tío",
  tia: "Tía",
  cunado: "Cuñado",
  cunada: "Cuñada",
  primo: "Primo",
  prima: "Prima",
  hermano: "Hermano",
  hermana: "Hermana",
  hijo: "Hijo",
  hija: "Hija",
  nieto: "Nieto",
  nieta: "Nieta",
  sobrino: "Sobrino",
  sobrina: "Sobrina",
  pareja: "Pareja",
  yerno: "Yerno",
  nuera: "Nuera",
  suegro: "Suegro",
  suegra: "Suegra",
  otro: "Otro",
};

export const DONATION_LINKS = {
  github: import.meta.env.VITE_DONATION_GITHUB ?? "",
  paypal: import.meta.env.VITE_DONATION_PAYPAL ?? "",
  buymeacoffee: import.meta.env.VITE_DONATION_BUYMEACOFFEE ?? "",
  stripe: import.meta.env.VITE_DONATION_STRIPE ?? "",
} as const;
