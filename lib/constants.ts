export const SITE_CONFIG = {
  name: "HustleClickGH",
  description: "Software Development | AI & Robotics Solutions | Digital Innovation Agency",
  contact: {
    email: "kwabenacrys@gmail.com",
    phone: "+233592405403",
    whatsapp: "https://wa.me/233592405403",
    linkedin: "https://www.linkedin.com/in/muheeb-nuaku-30923b25a/",
  },
  pricing: {
    standard: { min: 1800, max: 3000 },
    premium: { min: 3500, max: 10000 },
    classRate: 200,
  },
  survey: {
    minWithdrawal: 10,
    referralBonus: 1.0,
    referralMilestone: 15,
  },
} as const;

export const PROJECTS = [
  {
    id: "hospital",
    title: "Hospital Management System",
    description: "A comprehensive platform for managing operations, patient records, and automation at a private hospital to enhance efficiency and care delivery.",
    icon: "🏥",
    link: "#",
  },
  {
    id: "gift-hair",
    title: "Gift Hair Studio",
    description: "A stylish, responsive website for a premium hair salon, featuring service bookings, gallery showcases, and seamless contact integration to attract and serve clients effortlessly.",
    icon: "💇‍♀️",
    link: "https://www.gifthairstudio.com/",
  },
  {
    id: "apple-deals",
    title: "Apple Deals GH",
    description: "An eCommerce platform dedicated to Apple products in Ghana, with product listings, secure checkout, and promotional features to drive sales and customer engagement.",
    icon: "🍎",
    link: "https://www.appledealsgh.com/",
  },
  {
    id: "astute",
    title: "Astute Business Consulting",
    description: "A professional consulting site offering business planning services, with resource downloads, client testimonials, and lead generation tools to support entrepreneurs.",
    icon: "💼",
    link: "https://businessplangh.com/",
  },
] as const;

export const SERVICES = [
  { icon: "💻", title: "Software Development", description: "Custom apps with React Native, Node.js, and MongoDB for seamless user experiences" },
  { icon: "🖥️", title: "System Administration", description: "Reliable hosting, server management, and infrastructure setup with cPanel" },
  { icon: "🤖", title: "AI & Robotics", description: "Advanced voice, gesture, and automation systems for modern workflows" },
  { icon: "🚀", title: "Business Consulting", description: "Strategic tech advisory, digital transformation, and entrepreneurial support" },
] as const;

export const TECH_STACK = [
  { icon: "⚛️", name: "React Native" },
  { icon: "🟢", name: "Node.js + Express.js" },
  { icon: "🗄️", name: "MySQL" },
  { icon: "🌐", name: "HTML, CSS, JavaScript" },
  { icon: "🧠", name: "AI Prompt Engineering" },
  { icon: "🛡️", name: "Cybersecurity" },
] as const;
