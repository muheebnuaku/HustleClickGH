# HustleClick Ghana - Survey Platform

A modern, simplified Next.js application for HustleClick Ghana's paid survey platform where users can earn money by taking surveys.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up database and seed with sample data
npx prisma migrate dev

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) - Login with **USER000001** / **Admin@123**

## 📝 Login Credentials

### Admin Account
- **User ID**: USER000001
- **Password**: Admin@123

### Sample Users
- **USER000002** / User@123
- **USER000003** / User@123

## ✨ Features

### User Features
- 🔐 Secure User ID authentication
- 📝 Browse and complete surveys
- 💰 Real-time earnings tracking
- 💸 Mobile Money withdrawals (MTN, Vodafone, AirtelTigo)
- 🤝 Referral system (1.0 GHS per referral)
- 👤 Profile management

### Admin Features
- 📊 Platform statistics dashboard
- 👥 User management
- 📋 Create and manage surveys
- 📈 View survey responses
- ✅ Approve/reject withdrawals

## 🛠 Tech Stack

- Next.js 16.1.6 (App Router + Server Components)
- React 19.2.3
- TypeScript v5 (Strict)
- Prisma 5 + SQLite
- NextAuth.js + JWT
- Tailwind CSS v4
- react-hook-form + Zod

## 📂 Project Structure

```
app/
├── page.tsx                # Landing page
├── login/                  # Authentication
├── register/              
├── dashboard/              # User pages
├── profile/
├── income/
├── referral/
├── admin/                  # Admin panel
│   ├── users/
│   ├── payments/
│   └── responses/
└── api/                    # Backend routes
    ├── auth/
    ├── surveys/
    ├── withdrawals/
    └── referrals/
```

## 🔑 Environment Variables

Create `.env` file:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-min-32-chars"
```

## 📊 Database Schema

- **User**: Authentication, profile, balance, referrals
- **Survey**: Title, reward, questions, respondent limits
- **SurveyResponse**: User answers, timestamps
- **Withdrawal**: Amount, payment method, status
- **Referral**: Referrer/referred relationship, earnings

## 🚀 Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Lint code
npm run db:seed      # Reseed database
npx prisma studio    # Database GUI
```

## 📡 Key API Routes

### User
- `POST /api/auth/register` - Register
- `GET/PUT /api/profile` - Profile
- `GET /api/surveys` - Available surveys
- `POST /api/surveys/submit` - Submit response
- `GET/POST /api/withdrawals` - Withdrawals
- `GET /api/referrals` - Referral stats

### Admin
- `GET /api/admin/stats` - Dashboard stats
- `GET /api/admin/users` - All users
- `POST /api/surveys` - Create survey
- `GET /api/admin/surveys/[id]/responses` - Responses
- `PUT /api/withdrawals/[id]/approve` - Approve
- `PUT /api/withdrawals/[id]/reject` - Reject

## 💡 How It Works

1. **Registration**: Users sign up → System generates unique User ID
2. **Surveys**: Complete surveys → Earn money → Balance updates
3. **Referrals**: Share referral code → Earn 1.0 GHS per signup
4. **Withdrawals**: Request → Admin reviews → Approved/Rejected

## 🚀 Production Deployment

### Switch to PostgreSQL

Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Run migrations:
```bash
npx prisma migrate deploy
```

### Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

## 🔒 Security

- Passwords hashed with bcryptjs (12 rounds)
- JWT-based sessions
- Route protection via middleware
- Role-based access control
- SQL injection prevention (Prisma)

## 📖 Documentation

- [.github/copilot-instructions.md](.github/copilot-instructions.md) - AI coding guidelines
- [prisma/schema.prisma](prisma/schema.prisma) - Database schema
- [middleware.ts](middleware.ts) - Route protection

## ⚠️ Known Limitations

- Blog system: Not implemented
- Email notifications: Not configured
- Payment gateway: Manual processing

## 📞 Support

- Email: admin@hustleclickgh.com
- Website: https://hustleclickgh.com

---

Built with ❤️ by HustleClick Ghana © 2026
