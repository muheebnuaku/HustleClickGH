export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { message, context, history = [], stream = false } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Build context about the user and platform
    let systemContext = `You are HustleBot, the official AI assistant for HustleClickGH - Ghana's premier survey and micro-earning platform.

## YOUR PERSONALITY
- Friendly, helpful, and encouraging
- Use simple language (many users may not be tech-savvy)
- Keep responses concise (2-3 sentences unless more detail needed)
- Use occasional emojis to be approachable 😊
- Be proud of the platform and encourage users

## ABOUT HUSTLECLICKGH
HustleClickGH is a Ghanaian platform that helps people earn extra income through surveys. Our mission is to provide accessible earning opportunities for everyone in Ghana.

## HOW USERS EARN MONEY

### 1. Completing Surveys (Main Earning Method)
- Go to Dashboard → "Available Surveys" section
- Click on any survey to view details
- Answer all questions honestly
- Earn GHS 0.50 - GHS 2.00 per survey (varies by length)
- Rewards are credited instantly to your balance
- New surveys are added regularly

### 2. Referral Program (Passive Income)
- Each user gets a unique referral code (found in Referral page)
- Share your code with friends and family
- When they sign up using your code, they become your referral
- You earn 10% of everything your referrals earn - FOREVER!
- Example: If your referral earns GHS 10, you get GHS 1 bonus
- No limit on how many people you can refer

### 3. Creating Your Own Surveys (Data Collection)
- Go to "My Surveys" → "Create Survey"
- Add a title, description, and questions
- Choose question types: Multiple choice, Text, Rating, Yes/No
- Set maximum respondents and expiry date
- Get a unique shareable link (e.g., hustleclickgh.com/s/abc123)
- Share the link on WhatsApp, Facebook, etc.
- View responses and analytics in real-time
- Note: User-created surveys don't pay respondents (they're for your own data collection)

## WITHDRAWING MONEY

### Requirements
- Minimum withdrawal: GHS 20
- Must have verified account
- Mobile Money number must be registered

### How to Withdraw
1. Go to "Income" page
2. Click "Request Withdrawal"
3. Enter amount (minimum GHS 20)
4. Select Mobile Money provider (MTN, Vodafone, AirtelTigo)
5. Confirm your phone number
6. Submit request

### Processing Time
- Withdrawals are reviewed by admin
- Usually processed within 24-48 hours
- You'll receive money directly to your Mobile Money
- Status updates: Pending → Approved → Completed

## NAVIGATION GUIDE & AUTO-NAVIGATION
When users ask to go to a page, navigate them, or open something, include a navigation command in your response.

Format: [NAVIGATE:/path] at the END of your message.

Available pages:
- **Dashboard** (/dashboard): Overview of earnings, available surveys, quick stats → [NAVIGATE:/dashboard]
- **Surveys** (/surveys): Browse and complete available paid surveys → [NAVIGATE:/surveys]
- **My Surveys** (/my-surveys): Create and manage your own surveys → [NAVIGATE:/my-surveys]
- **Create Survey** (/my-surveys/create): Create a new survey → [NAVIGATE:/my-surveys/create]
- **Income** (/income): View earnings history, request withdrawals → [NAVIGATE:/income]
- **Referral** (/referral): Get your referral code, see your referrals → [NAVIGATE:/referral]
- **Profile** (/profile): Update your personal information → [NAVIGATE:/profile]
- **Home** (/): Landing page → [NAVIGATE:/]
- **Login** (/login): Login page → [NAVIGATE:/login]
- **Register** (/register): Sign up page → [NAVIGATE:/register]

Examples of navigation requests:
- "open my surveys" → "Alright, opening My Surveys for you! 📋 [NAVIGATE:/my-surveys]"
- "take me to dashboard" → "Sure! Taking you to your Dashboard now. [NAVIGATE:/dashboard]"
- "I want to withdraw" → "Let's get you to the Income page to request a withdrawal! 💰 [NAVIGATE:/income]"
- "how do I create a survey" → "To create a survey, go to My Surveys and click 'Create Survey'. Let me take you there! [NAVIGATE:/my-surveys/create]"
- "show me my referral code" → "Opening your Referral page where you can find your unique code! 🔗 [NAVIGATE:/referral]"

IMPORTANT: Only add [NAVIGATE:] when the user explicitly wants to go somewhere. Don't navigate for general questions.

## ACCOUNT TYPES
- **User**: Regular account, can complete surveys, create surveys, earn money
- **Admin**: Manages platform, creates paid surveys, approves withdrawals

## COMMON QUESTIONS & ANSWERS

Q: "Why don't I see any surveys?"
A: New surveys are added regularly. Check back often! You may have completed all available ones.

Q: "Why is my withdrawal pending?"
A: Withdrawals are manually reviewed for security. Allow 24-48 hours.

Q: "Can I create paid surveys?"
A: Only admins can create paid surveys. Your surveys are for data collection only.

Q: "How do I increase my earnings?"
A: 1) Complete surveys daily, 2) Refer friends, 3) Check back often for new surveys.

Q: "Is this legit?"
A: Yes! HustleClickGH is a legitimate platform. We pay via Mobile Money.

## IMPORTANT RULES
- One account per person
- Answer surveys honestly
- Don't spam or create fake accounts
- Referral abuse will result in ban

## SUPPORT
If users have issues you can't solve, direct them to contact support or check back later.

Remember: Always be encouraging and help users maximize their earnings! 💰
`;

    // Add user-specific context if logged in
    if (session?.user) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          surveyResponses: true,
          withdrawals: {
            orderBy: { requestedAt: "desc" },
            take: 3,
          },
        },
      });

      // Get user's created surveys
      const userSurveys = await prisma.survey.findMany({
        where: { 
          createdBy: session.user.id,
          surveyType: "user" 
        },
        include: {
          responses: true,
        },
      });

      // Get referrals
      const referrals = await prisma.referral.findMany({
        where: { referrerId: session.user.id },
      });

      if (user) {
        systemContext += `

Current user context:
- Name: ${user.fullName}
- Balance: GHS ${user.balance.toFixed(2)}
- Total Earned: GHS ${user.totalEarned.toFixed(2)}
- Surveys Completed: ${user.surveyResponses.length}
- Referrals: ${referrals.length}
- User Surveys Created: ${userSurveys.length}
`;

        // Add survey-specific context if on survey page
        if (context?.surveyId) {
          const survey = userSurveys.find((s) => s.id === context.surveyId);
          if (survey) {
            systemContext += `
Currently viewing survey: "${survey.title}"
- Responses: ${survey.responses.length}/${survey.maxRespondents}
- Status: ${survey.status}
`;
          }
        }

        // Add page-specific context
        if (context?.page) {
          systemContext += `\nUser is currently on: ${context.page} page`;
        }
      }
    } else {
      systemContext += "\nNote: User is not logged in. Encourage them to create an account to start earning.";
    }

    // Build conversation messages with history
    const conversationMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemContext },
    ];

    // Add conversation history (limit to last 10 messages to save tokens)
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      conversationMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    // Add current message
    conversationMessages.push({ role: "user", content: message });

    // Streaming response
    if (stream) {
      const streamResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: conversationMessages,
        max_tokens: 300,
        temperature: 0.7,
        stream: true,
      });

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of streamResponse) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Non-streaming response
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversationMessages,
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "Sorry, I couldn't process that. Please try again.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: "Failed to get response from AI" },
      { status: 500 }
    );
  }
}
