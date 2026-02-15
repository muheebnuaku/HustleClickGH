import Link from "next/link";
import Image from "next/image";
import { 
  Check, 
  BarChart3, 
  Users, 
  Shield, 
  Zap, 
  Globe, 
  Smartphone,
  FileText,
  TrendingUp,
  Clock,
  Award,
  Star
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        {/* Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI0MmYiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLThoLTJ2LTRoMnY0em0tOCA4aC0ydi00aDJ2NHptMC04aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Trusted by 500+ Organizations
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                Collect Better Data,
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400">
                  Make Smarter Decisions
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-300 mb-8 leading-relaxed max-w-xl">
                A powerful data collection platform that transforms how organizations gather insights, conduct surveys, and analyze responses in real-time.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-row gap-4 justify-center lg:justify-start mb-10">
                <Button size="lg" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/25 text-lg px-8" asChild>
                  <Link href="/register">
                    Start Collecting Data
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-slate-500 text-white hover:bg-white/10 text-lg px-8" asChild>
                  <Link href="/login">
                    Watch Demo
                  </Link>
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-slate-400 text-sm">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-green-400" />
                  <span>Secure & Private</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-yellow-400" />
                  <span>Real-time Analytics</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe size={18} className="text-blue-400" />
                  <span>Mobile Friendly</span>
                </div>
              </div>
            </div>

            {/* Right Content - Dashboard Preview */}
            <div className="relative hidden lg:block">
              <div className="relative">
                {/* Main Dashboard Image */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-blue-500/20 border border-slate-700">
                  <Image
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2940&auto=format&fit=crop"
                    alt="Data Analytics Dashboard"
                    width={600}
                    height={400}
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
                </div>

                {/* Floating Stats Card */}
                <div className="absolute -bottom-6 -left-6 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <TrendingUp className="text-green-600" size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">98.5%</p>
                      <p className="text-xs text-slate-500">Response Rate</p>
                    </div>
                  </div>
                </div>

                {/* Floating Survey Card */}
                <div className="absolute -top-4 -right-4 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FileText className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">10K+</p>
                      <p className="text-xs text-slate-500">Surveys Completed</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-slate-500 rounded-full flex items-start justify-center p-1">
            <div className="w-1.5 h-3 bg-slate-400 rounded-full animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <BarChart3 size={16} />
              <span>Why Choose Us</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Powerful Data Collection Made Simple
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Everything you need to collect, analyze, and act on data from your audience
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: FileText,
                title: "Smart Survey Builder",
                description: "Create professional surveys with multiple question types, logic branching, and customizable themes in minutes.",
                color: "blue"
              },
              {
                icon: BarChart3,
                title: "Real-time Analytics",
                description: "Watch responses come in live with beautiful charts, graphs, and exportable reports.",
                color: "purple"
              },
              {
                icon: Smartphone,
                title: "Mobile Optimized",
                description: "Surveys look perfect on any device. Respondents can complete surveys anywhere, anytime.",
                color: "green"
              },
              {
                icon: Shield,
                title: "Data Security",
                description: "Enterprise-grade encryption and privacy controls keep your data safe and compliant.",
                color: "orange"
              },
              {
                icon: Users,
                title: "Audience Management",
                description: "Build and segment your audience for targeted surveys and personalized experiences.",
                color: "pink"
              },
              {
                icon: Zap,
                title: "Instant Rewards",
                description: "Incentivize responses with instant mobile money payments directly to respondents.",
                color: "cyan"
              }
            ].map((feature) => {
              const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
                blue: { bg: "bg-blue-100 dark:bg-blue-900/30", icon: "text-blue-600", border: "hover:border-blue-300" },
                purple: { bg: "bg-purple-100 dark:bg-purple-900/30", icon: "text-purple-600", border: "hover:border-purple-300" },
                green: { bg: "bg-green-100 dark:bg-green-900/30", icon: "text-green-600", border: "hover:border-green-300" },
                orange: { bg: "bg-orange-100 dark:bg-orange-900/30", icon: "text-orange-600", border: "hover:border-orange-300" },
                pink: { bg: "bg-pink-100 dark:bg-pink-900/30", icon: "text-pink-600", border: "hover:border-pink-300" },
                cyan: { bg: "bg-cyan-100 dark:bg-cyan-900/30", icon: "text-cyan-600", border: "hover:border-cyan-300" }
              };
              const colors = colorClasses[feature.color];
              return (
                <Card key={feature.title} className={`group p-6 hover:shadow-xl transition-all duration-300 border-2 border-transparent ${colors.border}`}>
                  <CardContent className="p-0">
                    <div className={`w-14 h-14 ${colors.bg} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                      <feature.icon className={colors.icon} size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Clock size={16} />
              <span>How It Works</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Start Collecting Data in 3 Steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Create Your Survey",
                description: "Design beautiful surveys with our intuitive builder. Add questions, set logic, and customize branding.",
                image: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?q=80&w=2940&auto=format&fit=crop"
              },
              {
                step: "02",
                title: "Share & Collect",
                description: "Distribute via link, QR code, or embed on your website. Reach your audience wherever they are.",
                image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=2874&auto=format&fit=crop"
              },
              {
                step: "03",
                title: "Analyze & Act",
                description: "View real-time results, generate reports, and export data. Turn insights into action.",
                image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2426&auto=format&fit=crop"
              }
            ].map((item, index) => (
              <div key={item.step} className="relative group">
                {/* Connection Line */}
                {index < 2 && (
                  <div className="hidden md:block absolute top-24 left-full w-full h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 z-0" style={{ width: 'calc(100% - 2rem)', left: 'calc(50% + 1rem)' }}></div>
                )}
                
                <Card className="relative overflow-hidden border-2 hover:border-blue-300 transition-all hover:shadow-xl">
                  {/* Image */}
                  <div className="relative h-48 overflow-hidden">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
                    <div className="absolute bottom-4 left-4 text-5xl font-bold text-white/20">{item.step}</div>
                  </div>
                  
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4 -mt-10 relative z-10 shadow-lg">
                      {item.step}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{item.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{item.description}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
            {[
              { number: "10K+", label: "Surveys Created" },
              { number: "500K+", label: "Responses Collected" },
              { number: "99.9%", label: "Uptime" },
              { number: "24/7", label: "Support" }
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl sm:text-5xl font-bold mb-2">{stat.number}</div>
                <div className="text-blue-100">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-24 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Award size={16} />
              <span>Use Cases</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Perfect for Every Industry
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              From research institutions to businesses, our platform adapts to your needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                title: "Academic Research",
                description: "Conduct surveys for dissertations, thesis projects, and academic studies with robust data collection tools.",
                image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2940&auto=format&fit=crop",
                features: ["Ethics-compliant consent forms", "Anonymous responses", "Data export for SPSS/Excel"]
              },
              {
                title: "Market Research",
                description: "Understand your customers better with targeted surveys and detailed demographic analysis.",
                image: "https://images.unsplash.com/photo-1533750349088-cd871a92f312?q=80&w=2940&auto=format&fit=crop",
                features: ["Customer satisfaction surveys", "Product feedback forms", "Brand awareness studies"]
              },
              {
                title: "Healthcare & NGOs",
                description: "Collect health data, conduct community assessments, and gather feedback from beneficiaries.",
                image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?q=80&w=2940&auto=format&fit=crop",
                features: ["Patient feedback forms", "Community health surveys", "Impact assessments"]
              },
              {
                title: "Employee Engagement",
                description: "Measure employee satisfaction, gather feedback, and improve workplace culture.",
                image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2940&auto=format&fit=crop",
                features: ["360° feedback surveys", "Pulse surveys", "Exit interviews"]
              }
            ].map((useCase) => (
              <Card key={useCase.title} className="overflow-hidden group hover:shadow-2xl transition-all border-2 hover:border-blue-300">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className="relative h-64 lg:h-auto overflow-hidden">
                    <Image
                      src={useCase.image}
                      alt={useCase.title}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  <CardContent className="p-6 flex flex-col justify-center">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{useCase.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-4">{useCase.description}</p>
                    <ul className="space-y-2">
                      {useCase.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <Check size={16} className="text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Star size={16} />
              <span>Testimonials</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Trusted by Researchers & Organizations
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: "Dr. Kwame Asante",
                role: "Senior Lecturer, University of Ghana",
                content: "This platform revolutionized how I collect data for my research. The ease of use and real-time analytics saved me countless hours.",
                rating: 5
              },
              {
                name: "Abena Mensah",
                role: "Research Coordinator, NGO",
                content: "Perfect for community health assessments. The mobile-friendly surveys meant we could reach respondents even in remote areas.",
                rating: 5
              },
              {
                name: "Kofi Owusu",
                role: "Market Research Analyst",
                content: "The instant payment feature increased our response rates dramatically. A game-changer for market research in Ghana.",
                rating: 5
              }
            ].map((testimonial) => (
              <Card key={testimonial.name} className="p-6 hover:shadow-xl transition-all">
                <CardContent className="p-0">
                  {/* Stars */}
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} size={18} className="text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  
                  <p className="text-slate-600 dark:text-slate-400 mb-6 italic">&ldquo;{testimonial.content}&rdquo;</p>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{testimonial.name}</p>
                      <p className="text-sm text-slate-500">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Data Collection?
          </h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            Join thousands of researchers, businesses, and organizations using our platform to gather insights and make data-driven decisions.
          </p>

          <div className="flex flex-row gap-4 justify-center">
            <Button size="lg" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/25 text-lg px-8" asChild>
              <Link href="/register">
                Create Free Account
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-slate-500 text-white hover:bg-white/10 text-lg px-8" asChild>
              <Link href="/login">
                Sign In
              </Link>
            </Button>
          </div>

          {/* Trust Badge */}
          <div className="mt-10 flex items-center justify-center gap-4 text-slate-400 text-sm">
            <Shield size={18} className="text-green-400" />
            <span>No credit card required • Free to start • Cancel anytime</span>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
