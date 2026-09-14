import { assets } from "./assets/assets";

export const coinPackages = [
    {
        id: 'basic',
        name: 'Basic Pack',
        coins: 100,
        bonus: 0,
        price: 99,
        popular: false,
        color: 'bg-blue-50 border-blue-200',
        button: 'bg-blue-600 hover:bg-blue-700'
    },
    {
        id: 'standard',
        name: 'Standard Pack',
        coins: 500,
        bonus: 50,
        price: 499,
        popular: true,
        color: 'bg-green-50 border-green-200',
        button: 'bg-green-600 hover:bg-green-700'
    },
    {
        id: 'premium',
        name: 'Premium Pack',
        coins: 1000,
        bonus: 150,
        price: 999,
        popular: false,
        color: 'bg-purple-50 border-purple-200',
        button: 'bg-purple-600 hover:bg-purple-700'
    },
    {
        id: 'mega',
        name: 'Mega Pack',
        coins: 2000,
        bonus: 400,
        price: 1899,
        popular: false,
        color: 'bg-orange-50 border-orange-200',
        button: 'bg-orange-600 hover:bg-orange-700'
    }
]

export const teamMembers = [
    {
      image: assets.founder1,
      name: "Rishab Negi",
      title: "B.Tech",
      education: "B.Tech",
      description: "Co-Founder & Full-Stack AI Developer",
      role: "Co-Founder & Full-Stack AI Developer",
      imagePosition: "object-[center_35%]",
      about: "Rishab has been involved across the full technical development of Therapique, working on both the product experience and its underlying functionality. He led the development of the platform's newer features and helped evolve Therapique from its original project into a more complete and interactive platform.",
      contributions: [
        "Frontend development",
        "Backend development",
        "AI chatbot",
        "Video calling system",
        "Library and notes experience",
        "UI/UX improvements",
        "Animations and interactive experiences",
      ],
    },
    {
      image: assets.founder2,
      name: "Ishaan Jain",
      title: "B.Tech",
      education: "B.Tech",
      description: "Co-Founder & Backend Developer",
      role: "Co-Founder & Backend Developer",
      imagePosition: "object-top",
      about: "Ishaan contributed to the technical foundation of Therapique, with a primary focus on backend development and data management. He worked on the server-side systems that support the platform and helped establish its backend architecture.",
      contributions: [
        "Backend development",
        "MongoDB",
        "API development",
        "Server-side architecture",
        "Data management",
      ],
    },
    {
      image: assets.founder3,
      name: "Tarun",
      title: "B.Tech",
      education: "B.Tech",
      description: "Co-Founder & Frontend Developer",
      role: "Co-Founder & Frontend Developer",
      imagePosition: "object-[center_75%]",
      about: "Tarun contributed to the frontend development of Therapique, helping shape the platform's user-facing experience. He also worked on the video-call experience and collaborated on bringing the product's interface and functionality together.",
      contributions: [
        "Frontend development",
        "UI implementation",
        "Video-call functionality",
        "User interface development",
        "Product collaboration",
      ],
    },
  ];