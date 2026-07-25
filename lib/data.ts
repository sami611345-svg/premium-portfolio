export const PROJECTS = [
  {
    id: "ecommerce-backend",
    title: "Production-Ready E-Commerce Backend",
    subtitle: "Scalable REST API Platform",
    description:
      "Developed scalable REST APIs for authentication, products, carts, and orders using Django REST Framework. Secured the platform with JWT authentication and role-based access control, backed by a normalized PostgreSQL schema. Containerized the service with Docker and served it through Gunicorn behind NGINX on AWS EC2 for a production-ready deployment.",
    proofPoints: [
      "JWT authentication with role-based access control (RBAC)",
      "Products, carts, and orders exposed through clean REST APIs",
      "Containerized with Docker, served via Gunicorn + NGINX on AWS EC2",
    ],
    tech: "Python, Django, DRF, PostgreSQL, Docker, Gunicorn, NGINX, AWS EC2",
    tags: ["REST API", "Django REST Framework", "AWS"],
    github: "",
    links: [],
    images: [
      "/assets/projects/ecommerce-architecture.png",
      "/assets/projects/ecommerce-schema.png",
      "/assets/projects/ecommerce-deployment.png",
    ],
    imageAlts: [
      "E-commerce backend architecture: NGINX and Gunicorn fronting a Django REST API with auth, products, cart, and orders services",
      "PostgreSQL entity-relationship schema for users, products, carts, and orders",
      "Deployment pipeline: Dockerized Django app served by Gunicorn behind NGINX on AWS EC2 with JWT auth",
    ],
    metric: "JWT + RBAC auth · Dockerized · deployed on AWS EC2",
  },
  {
    id: "fundraising-system",
    title: "Fundraising Management System",
    subtitle: "Full-Stack Donation Platform",
    description:
      "Built a full-stack fundraising application with payment integration for a US client. Owned the backend architecture and REST API development end to end, designing a relational PostgreSQL schema for campaigns, donations, and users. Delivered a secure payment flow and handled production deployment on AWS EC2.",
    proofPoints: [
      "Backend architecture and REST API development end to end",
      "PostgreSQL relational schema for campaigns, donations, and users",
      "Secure payment integration and production deployment for a US client",
    ],
    tech: "Django, DRF, PostgreSQL, AWS EC2",
    tags: ["Backend Architecture", "Payments", "PostgreSQL"],
    github: "",
    links: [],
    images: [
      "/assets/projects/fundraising-architecture.png",
      "/assets/projects/fundraising-payments.png",
    ],
    imageAlts: [
      "Fundraising system architecture: web client connected to a Django REST API, campaigns/donations/users services, and PostgreSQL",
      "Secure donation payment flow from the Django API through a payment gateway with transaction records in PostgreSQL",
    ],
    metric: "Payment integration · production deploy · US client",
  },
  {
    id: "greenery-cms",
    title: "Greenery Institute CMS",
    subtitle: "Production Content Management System",
    description:
      "Developed a production-ready Content Management System using Django REST Framework. Built secure REST APIs with PostgreSQL integration, then containerized the stack with Docker and served it through Gunicorn behind NGINX. Deployed and administered the application on a Linux server hosted on DigitalOcean.",
    proofPoints: [
      "Secure REST APIs backed by PostgreSQL integration",
      "Containerized with Docker, served by Gunicorn + NGINX",
      "Deployed and administered on Linux via DigitalOcean hosting",
    ],
    tech: "Django, DRF, PostgreSQL, Docker, Gunicorn, NGINX, Linux, DigitalOcean",
    tags: ["CMS", "Django REST Framework", "DevOps"],
    github: "",
    links: [],
    images: [
      "/assets/projects/cms-architecture.png",
      "/assets/projects/cms-deployment.png",
    ],
    imageAlts: [
      "CMS architecture: Django REST Framework content, pages, and media services behind secure REST APIs with role-based access and PostgreSQL",
      "Cloud deployment: Dockerized Django app served by Gunicorn behind NGINX on a Linux DigitalOcean server",
    ],
    metric: "Secure REST APIs · Dockerized · DigitalOcean hosting",
  },
] as const;

export const FEATURED_PROJECTS = PROJECTS.slice(0, 3);
export const SECONDARY_PROJECTS = PROJECTS.slice(3);


export const BUILDING = [
  {
    id: "building-system-design",
    status: "Active",
    title: "Advanced System Design & Scalability",
    description:
      "Deepening distributed systems fundamentals - caching, load balancing, and horizontal scaling patterns for high-throughput backend services.",
    tags: ["System Design", "Scalability", "Backend"],
    steps: ["STUDY", "MODEL", "PROTOTYPE", "BENCHMARK", "APPLY"],
  },
  {
    id: "building-cicd",
    status: "In Progress",
    title: "CI/CD & Deployment Automation",
    description:
      "Building automated deployment pipelines with Docker Compose and GitHub Actions to ship Django services to Linux and cloud servers reliably.",
    tags: ["Docker", "CI/CD", "DevOps"],
    steps: ["PLAN", "BUILD", "TEST", "DEPLOY", "MONITOR"],
  },
] as const;

export type BuildingItem = (typeof BUILDING)[number];
