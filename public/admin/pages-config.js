// Pages the admin can edit. Add or remove entries here as the site grows.
// `path` is relative to the repo root.
// `title` is what shows in the dashboard.
// `description` is one-line context to help the editor pick the right page.

window.EDITABLE_PAGES = [
  {
    path: "public/index.html",
    title: "Homepage",
    description: "Main landing page (skdentalgroup.com)",
    icon: "🏠",
  },
  {
    path: "public/doctor/index.html",
    title: "Our Doctor",
    description: "Doctor profile and bio (/doctor)",
    icon: "👤",
  },
  {
    path: "public/first-visit/index.html",
    title: "First Visit",
    description: "First-visit info for new patients (/first-visit)",
    icon: "📋",
  },
  {
    path: "public/insurance/index.html",
    title: "Insurance",
    description: "Insurance and payment info (/insurance)",
    icon: "💳",
  },
  {
    path: "public/contact-us/index.html",
    title: "Contact Us",
    description: "Contact form and clinic info (/contact-us)",
    icon: "📞",
  },
  {
    path: "public/services/general/index.html",
    title: "Services — General",
    description: "General dentistry services page",
    icon: "🦷",
  },
  {
    path: "public/services/preventive/index.html",
    title: "Services — Preventive",
    description: "Preventive dentistry services page",
    icon: "🛡️",
  },
  {
    path: "public/services/pediatric/index.html",
    title: "Services — Pediatric",
    description: "Pediatric dentistry services page",
    icon: "🧒",
  },
  {
    path: "public/services/cosmetic/index.html",
    title: "Services — Cosmetic",
    description: "Cosmetic dentistry services page",
    icon: "✨",
  },
  {
    path: "public/home-page/index.html",
    title: "Home (alias)",
    description: "Duplicate of homepage at /home-page (legacy URL)",
    icon: "🔗",
  },
];

// GitHub repo this admin commits to.
window.REPO = {
  owner: "swatikiran682",
  name: "skdental-site",
  branch: "main",
};
