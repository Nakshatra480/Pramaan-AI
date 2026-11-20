export interface Plan {
  id: "free" | "personal" | "pro" | "team";
  name: string;
  price: number;
  cadence: string;
  tagline: string;
  features: string[];
  limits: { research: number; deep: number; storageGb: number; documents: number };
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    cadence: "forever",
    tagline: "For trying evidence-first research.",
    features: ["30 research runs / month", "3 Deep Research runs", "Web + academic sources", "250 MB library", "Share & export"],
    limits: { research: 30, deep: 3, storageGb: 0.25, documents: 25 },
  },
  {
    id: "personal",
    name: "Personal",
    price: 12,
    cadence: "per month",
    tagline: "For students and independent researchers.",
    features: ["200 research runs / month", "25 Deep Research runs", "5 GB private library", "Unlimited projects", "Follow-up research"],
    limits: { research: 200, deep: 25, storageGb: 5, documents: 500 },
  },
  {
    id: "pro",
    name: "Pro",
    price: 24,
    cadence: "per month",
    tagline: "For professionals who research daily.",
    features: ["Unlimited standard research", "100 Deep Research runs", "25 GB private library", "Priority research queue", "Advanced model settings"],
    limits: { research: 2000, deep: 100, storageGb: 25, documents: 5000 },
    highlighted: true,
  },
  {
    id: "team",
    name: "Team",
    price: 20,
    cadence: "per member / month",
    tagline: "For teams building shared knowledge.",
    features: ["Everything in Pro", "Shared projects & libraries", "Owner, editor & viewer roles", "Centralised billing", "SSO (coming soon)"],
    limits: { research: 2000, deep: 150, storageGb: 100, documents: 20000 },
  },
];
