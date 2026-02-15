# HustleClickGH - Copilot Instructions

## Project Overview
HustleClick is a software development and AI innovation agency based in Ghana with an integrated **paid survey platform** where users earn money by completing surveys. This is the Next.js 16.1.6 migration of the original HTML/CSS/JS website (www.hustleclickgh.com). The project uses App Router architecture with TypeScript, React 19, and Tailwind CSS v4.

**Migration Philosophy**: Simplify the complex HTML pages into a clean, modern, easy-to-use Next.js application. Focus on user experience, intuitive navigation, and streamlined workflows.

### Business Context
- **Industry**: Software development, AI/Robotics solutions, system administration, business consulting
- **Target Market**: African businesses seeking digital transformation and global competitiveness
- **Core Services**: Custom app development (React Native, Node.js, MongoDB), hosting/server management, AI automation, tech consulting
- **Portfolio**: Hospital management systems, eCommerce platforms (Apple Deals GH), salon websites (Gift Hair Studio), business consulting sites
- **Survey Platform**: Users earn money answering surveys, paid via Mobile Money (minimum withdrawal: 10 GHS)

## Tech Stack
- **Framework**: Next.js 16.1.6 (App Router)
- **React**: 19.2.3 with RSC (React Server Components)
- **TypeScript**: v5 with strict mode enabled
- **Styling**: Tailwind CSS v4 with PostCSS plugin architecture
- **Fonts**: Geist Sans and Geist Mono (Google Fonts via `next/font`)
- **Linting**: ESLint v9 with Next.js Core Web Vitals config

## Site Structure (Migration from HTML/CSS/JS)

### Public Pages
- **Landing Page** (`/`): Hero section, about, projects showcase, services/pricing, expertise, classes, contact
- **Authentication**: 
  - `/register` - User registration with referral ID support (from register.html)
  - `/login` - Login with User ID and password (from login.html)

### User Dashboard Pages (Protected Routes)
- **`/dashboard`** - Survey dashboard showing available surveys with refresh functionality
- **`/profile`** - User profile management (name, email, phone, password, national ID)
- **`/income`** - Withdrawal page: request withdrawals via Mobile Money (min 10 GHS), view withdrawal history
- **`/referral`** - Referral program: unique link sharing, earn 1.0 GHS per referral, track progress (bonus at 15 referrals)

### Admin Panel Pages (Admin Protected Routes)
- **`/admin`** - Survey management: create surveys (title, description, visibility, max respondents, expiration, reward amount, questions), view active surveys
- **`/admin/users`** - User management: view all users, export contacts (CSV), copy emails/phone numbers, export phone numbers (Excel)
- **`/admin/payments`** - Payment management: view/filter withdrawal requests by status, approve/reject payments
- **`/admin/responses`** - Survey responses: load by Survey ID, export as PDF/XLS, table/card views
- **`/admin/private-responses`** - Private survey responses
- **`/admin/blog`** - Blog management
- Protected routes (dashboard, admin) need middleware or route guards for authentication
- Group related routes: `app/(auth)/{login,register}`, `app/(dashboard)/{dashboard,profile,income,referral}`, `app/(admin)/{admin,...}`

### Data Flow & State Management
- **Survey System**: Create surveys with questions, track responses, manage survey lifecycle (active/expired)
- **User Accounts**: Track earnings, balance, referrals, withdrawal history, profile data
- **Payment Processing**: Mobile Money withdrawals (minimum 10 GHS), payment status tracking (pending/approved/rejected)
- **Referral System**: Generate unique referral links, track referral count and earnings (1.0 GHS per referral), bonus milestones
- **Admin Operations**: User management, survey creation, payment approval, response analytics, data export (CSV, Excel, PDF)

### Authentication & Authorization
- **User roles**: Regular users vs. Admin users
- **Session management**: Track logged-in state, user ID, balance display
- **Security**: Password requirements (8+ chars, 1 uppercase, 1 number, 1 symbol), national ID storage
- **Login types**: User ID-based authentication (not email login)

### Original Marketing Site Features to Port
- Project showcase (Hospital Management, Gift Hair Studio, Apple Deals GH, Astute Business Consulting)
- Service packages (Standard GH₵1,800-3,000, Premium GH₵3,500-10,000)
- Tech stack display (React Native, Node.js, MySQL, HTML/CSS/JS, AI, Cybersecurity)
- Web Development Vacation Class (GHC 200, Mon/Wed/Fri online)
- Contact integration (WhatsApp +233592405403, Email kwabenacrys@gmail.com, LinkedIn)

## Architecture Patterns

### File-Based Routing
- All routes live in `app/` directory following App Router conventions
- `app/layout.tsx` defines the root layout with font variables and metadata
- `app/page.tsx` is the home route (`/`) - current placeholder, needs full landing page implementation
- Use Server Components by default; add `"use client"` directive only when needed for client-side interactivity
- Authentication pages will need client-side state management for forms

### Styling Approach
- Tailwind CSS v4 uses the new PostCSS plugin (`@tailwindcss/postcss`) instead of traditional config files
- CSS variables defined in `app/globals.css` using `@theme inline` directive for custom design tokens
- Dark mode handled via `prefers-color-scheme` media query
- Custom CSS variables: `--background`, `--foreground`, `--font-geist-sans`, `--font-geist-mono`

### TypeScript Configuration
- Path alias `@/*` maps to project root for clean imports (e.g., `import from '@/components/Button'`)
- React JSX transform enabled (`"jsx": "react-jsx"`)
- Module resolution set to `"bundler"` for Next.js compatibility
- Target is ES2017 for broad browser support

## Development Workflow

### Running the App
```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Create production build
npm start        # Run production server
npm run lint     # Run ESLint
```

### Key Commands
- Development server runs on port 3000 by default
- Hot reload is automatic when editing `.tsx` or `.css` files
- ESLint uses flat config format (eslint.config.mjs)

## Project-Specific Conventions

### Component Structure
- Components use TypeScript with explicit typing
- Font loading pattern: Define fonts in `app/layout.tsx` and pass as CSS variables
- Use `next/image` component for all images (see `app/page.tsx` for examples)
- Responsive design uses Tailwind's `sm:` prefix for mobile-first breakpoints
- Keep original site's branding: professional tech agency aesthetic with African market focus

### Styling Patterns
- Combine utility classes with dark mode variants: `dark:bg-black`, `dark:text-zinc-50`
- Use Zinc color palette for text (`text-zinc-600`, `text-zinc-400`)
- Antialiasing applied globally via `antialiased` class on body
- Flexbox layouts with gap utilities for spacing
- Maintain responsive design from original HTML/CSS site (mobile-first)

### Simplification & Migration Guidelines

**Core Principle**: Make everything simpler and more intuitive than the original HTML version.

#### UI/UX Simplification
- **Clean layouts**: Use generous whitespace, clear visual hierarchy, modern card-based designs
- **Intuitive navigation**: Simple top nav with clear labels, sticky headers, mobile-friendly hamburger menu
- **Reduce cognitive load**: One primary action per page, clear CTAs, progressive disclosure for complex features
- **Consistent patterns**: Reuse components (buttons, cards, forms, modals) across the entire site
- **Mobile-first**: Ensure everything works beautifully on mobile before adding desktop enhancements
- **Loading states**: Use skeleton loaders and optimistic UI instead of blocking spinners
- **Error handling**: Friendly error messages with clear next steps, toast notifications for feedback

#### Technical Simplification
- **Server Components first**: Use RSC for data fetching, reduce client-side JavaScript
- **Server Actions**: Handle forms with Next.js Server Actions - no complex client state management
- **Simplified state**: Minimize useState/useEffect - let the server handle complexity
- **Type safety**: Use TypeScript interfaces to prevent bugs and improve DX
- **Reusable components**: Create small, focused components in `components/` directory
- **Data validation**: Zod schemas for form validation on both client and server
- **API routes**: Use Next.js Route Handlers for clean API endpoints (`/api/*`)

#### Data Management
- Store static content (projects, services, expertise) in structured TypeScript files or JSON
- Use React Server Components to fetch data at build/request time
- Implement proper caching strategies with Next.js revalidation
- Keep survey data, responses, and user info in database with proper indexes
- Use Prisma or Drizzle ORM for type-safe database queries

#### Form & Interaction Patterns
- Replace inline JavaScript with React event handlers
- Use Server Actions for form submissions (login, register, surveys, withdrawals)
- Implement proper form validation with instant feedback
- Add loading states and disabled buttons during submissions
- Use URL parameters for navigation state instead of complex client state
- Implement toast notifications for success/error messages

### Code Style
- **Component organization**: `components/ui/` for basic UI, `components/features/` for feature components
- **File naming**: Use kebab-case for files (`user-dashboard.tsx`), PascalCase for components
- **Utility-first CSS**: Use Tailwind utilities, avoid custom CSS unless absolutely necessary
- **Class organization**: Use `clsx` or `cn()` helper for conditional classes
- **Template literals**: For combining className strings with font variables
- **External links**: Always include `target="_blank"` and `rel="noopener noreferrer"`
- **Semantic HTML**: Use proper elements (`<main>`, `<nav>`, `<section>`, `<article>`)
- **Type safety**: Readonly props, strict TypeScript, no `any` types
- **Currency**: Use GH₵ (Ghana Cedis) symbol consistently
- **Comments**: Add JSDoc comments for complex components, explain "why" not "what"

## Integration Points
- **Database**: Backend with MySQL/MongoDB for users, surveys, responses, payments, referrals
- **Mobile Money API**: Ghana payment gateway for withdrawals (MTN Mobile Money, Vodafone Cash, AirtelTigo Money)
- **Email Service**: User notifications, withdrawal confirmations, admin alerts
- **Session Management**: Secure user sessions, JWT tokens or NextAuth.js
- **File Export**: Libraries for PDF (jsPDF), Excel (xlsx), CSV generation
- **WhatsApp Integration**: Business contact (+233592405403), class signups, customer support
- **External Projects**: Links to portfolio sites (gifthairstudio.com, appledealsgh.com, businessplangh.com)
- **Vercel**: Deployment platform with environment variables for API keys

## Key Features to Implement

### User Features
- Registration with optional referral ID
- Login with User ID (not email)
- View available surveys on dashboard
- Coatabase Schema (To Implement)

### Key Tables/Collections
- **Users**: id, user_id (unique), full_name, email, phone, password_hash, national_id, balance, referral_code, referred_by, created_at, role (user/admin)
- **Surveys**: id, title, description, visibility, max_respondents, current_respondents, expiration_date, reward_amount, status (active/expired), created_by, created_at
- **Survey_Questions**: id, survey_id, question_text, question_type, options (JSON), required, order
- **Survey_Responses**: id, survey_id, user_id, answers (JSON), completed_at, rewarded
- **Withdrawals**: id, user_id, amount, payment_method, mobile_number, account_name, status (pending/approved/rejected), requested_at, processed_at
- **Referrals**: id, referrer_user_id, referred_user_id, referral_earned (1.0 GHS), created_at

## Technical Considerations
- **Currency**: Ghana Cedis (GHS) throughout the platform
- **Minimum withdrawal**: 10 GHS
- **Referral earnings**: Fixed 1.0 GHS per successful referral
- **Referral bonus**: Special reward at 15 referrals milestone
- **Password policy**: Minimum 8 characters, 1 uppercase, 1 number, 1 symbol
- **Payment methods**: Mobile Money (MTN, Vodafone, AirtelTigo)
- **User identification**: User ID system (not email-based login)
- **Data export formats**: CSV for contacts, Excel for phone numbers, PDF/XLS for survey responses
- **Real-time features**: Balance updates, survey availability, referral tracking
- **Admin permissions**: Separate authentication and authorization for admin pages

## Do This ✅
- **Simplify everything**: If a feature feels complex, break it down further
- **Use Server Components**: Default to RSC, only add "use client" when needed
- **Implement early validation**: Validate forms on client and server
- **Provide instant feedback**: Loading states, success/error messages
- **Think mobile-first**: Design for mobile, enhance for desktop
- **Use shadcn/ui**: Install and use pre-built accessible components
- **Keep it DRY**: Extract reusable components and utilities
- **Type everything**: No `any` types, use proper interfaces
- **Handle errors gracefully**: Show friendly messages, log technical details
- **Test critical paths**: Auth, payments, survey submissions

## Don't Do This ❌
- Don't create `tailwind.config.js` - Tailwind v4 uses PostCSS plugin only
- Don't use `pages/` directory - this project uses App Router exclusively
- Don't import CSS files besides `globals.css` - use Tailwind utilities
- Don't bypass `next/image` - always use Image component for optimization
- Don't overcomplicate - keep it simpler than the original HTML version
- Don't hardcode values - use environment variables and config files
- Don't expose admin routes without authentication middleware
- Don't process payments without validation and security
- Don't forget input sanitization - prevent XSS and SQL injection
- Don't create complex client state - let the server handle complexity
- Don't skip loading/error states - users need feedback
- Don't use inline styles - use Tailwind classes consistently
- **Date handling**: `date-fns` for date formatting
- **Data fetching**: Built-in `fetch` with Next.js caching
- **State**: Server state preferred, `zustand` for minimal client state if needed

### Development Tools
- **Type safety**: Use TypeScript strict mode
- **Code quality**: ESLint + Prettier (already configured)
- **Database migrations**: Prisma migrations or Drizzle Kit
- **Environment variables**: `.env.local` with type-safe `process.env`

## Simplified User Flows

### User Registration Flow (Simplified)
1. Single-page form: name, email, phone, password, optional referral code
2. Inline validation with instant feedback
3. Server Action submission with loading state
4. Auto-login after successful registration
5. Redirect to dashboard with welcome toast

### Survey Taking Flow (Simplified)
1. Dashboard shows available surveys in clean cards
2. Click survey → Modal or new page with questions
3. Simple form with progress indicator
4. Submit → Instant balance update with confetti animation
5. Toast notification: "Earned X GHS! New balance: Y GHS"

### Withdrawal Flow (Simplified)
1. Single form: amount input, payment method dropdown, mobile number
2. Real-time validation (min 10 GHS, sufficient balance)
3. Preview withdrawal details before confirmation
4. Submit → Pending status with clear next steps
5. Email notification sent automatically

### Admin Dashboard (Simplified)
1. Clean sidebar navigation: Surveys, Users, Payments, Analytics
2. Each section: data table with search, filter, sort
3. Quick actions: approve/reject buttons, export data
4. Modal for creating surveys (step-by-step wizard)
5. Real-time stats cards at top (total users, pending payments, active surveys)

## Don't Do This
- Don't create a `tailwind.config.js` file - Tailwind v4 uses PostCSS plugin only
- Don't use `pages/` directory - this project uses App Router exclusively
- Don't import CSS files other than `globals.css` in layout - use Tailwind utilities
- Don't bypass `next/image` for static images - always use the Image component
- Don't lose the original site's content during migration - preserve all sections, services, and portfolio items
- Don't hardcode contact info, payment thresholds, or referral amounts - use environment variables or config
- Don't expose admin routes without proper authentication guards
- Don't process payments without proper validation and security measures
- Don't forget to sanitize user inputs, especially in survey questions and response
- Edit profile (name, email, phone, password, national ID)

### Admin Features
- Create surveys: title, description, visibility settings, max respondents, expiration date, reward amount
- Add survey questions dynamically
- Preview surveys before publishing
- Manage active surveys
- View all registered users
- Export user contacts (CSV), emails, phone numbers (Excel)
- Review withdrawal requests
- Filter payments by status (pending/approved/rejected)
- Approve or reject withdrawal requests
- View survey responses by Survey ID
- Export responses as PDF or Excel
- Toggle between table and card views
- Access private survey responses
- QR code generation for surveys/links
- Blog management

## Don't Do This
- Don't create a `tailwind.config.js` file - Tailwind v4 uses PostCSS plugin only
- Don't use `pages/` directory - this project uses App Router exclusively
- Don't import CSS files other than `globals.css` in layout - use Tailwind utilities
- Don't bypass `next/image` for static images - always use the Image component
- Don't lose the original site's content during migration - preserve all sections, services, and portfolio items
- Don't hardcode contact info - use environment variables for email, phone, social links
