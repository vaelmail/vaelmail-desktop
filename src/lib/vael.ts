export const vael = {
  website: "vaelmail.com",
  email: "vael.email",
  alias: "vael.pw",
  aliasCount: 3,
  register: "/register",
  login: "/login",
  plusRegister: "/register?plan=plus",
} as const;

export type VaelPlan = "free" | "plus";

export const planDetails = {
  free: {
    price: 0,
    storage: "50 mb",
    customAliases: 3,
    generatedAliases: 50,
    customDomains: 0,
    support: "basic support",
  },
  plus: {
    price: 5,
    storage: "1 gb",
    customAliases: 50,
    generatedAliases: "unlimited",
    customDomains: 3,
    support: "priority support",
  },
} as const;
