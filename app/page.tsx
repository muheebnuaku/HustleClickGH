import Link from "next/link";
import Image from "next/image";
import {
  Check,
  BarChart3,
  Shield,
  Zap,
  Globe,
  Mic,
  TrendingUp,
  Clock,
  Award,
  Star,
  Database,
  Languages,
  PhoneCall,
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
                Ghana&apos;s AI Dataset Collection Platform
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                Build AI Datasets,
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400">
                  Earn Real Money
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-300 mb-8 leading-relaxed max-w-xl">
                Record your voice, complete surveys, and contribute data for AI training — in English, Twi, Ga, Hausa and more. Get paid instantly via Mobile Money.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-row gap-4 justify-center lg:justify-start mb-10">
                <Button size="lg" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/25 text-lg px-8" asChild>
                  <Link href="/register">
                    Start Earning
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-slate-500 text-white hover:bg-white/10 text-lg px-8" asChild>
                  <Link href="/login">
                    View Projects
                  </Link>
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-slate-400 text-sm">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-green-400" />
                  <span>Consented & Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-yellow-400" />
                  <span>Instant Momo Payout</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe size={18} className="text-blue-400" />
                  <span>Local Languages</span>
                </div>
              </div>
            </div>

            {/* Right Content */}
            <div className="relative hidden lg:block">
              <div className="relative">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-blue-500/20 border border-slate-700">
                  <Image
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2940&auto=format&fit=crop"
                    alt="AI Dataset Collection Dashboard"
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
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">GH₵50K+</p>
                      <p className="text-xs text-slate-500">Paid to contributors</p>
                    </div>
                  </div>
                </div>

                {/* Floating Tasks Card */}
                <div className="absolute -top-4 -right-4 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <Mic className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">25K+</p>
                      <p className="text-xs text-slate-500">Recordings collected</p>
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
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <BarChart3 size={16} />
              <span>Platform Features</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Everything AI Teams Need
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Collect high-quality, consented datasets from real Ghanaian voices — at any sample rate, format, or recording type your project requires
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Mic,
                title: "Configurable Voice Datasets",
                description: "Specify exact audio specs per project: WAV format, 16/48 kHz sample rate, mono/stereo channels, 16/32-bit depth.",
                color: "blue"
              },
              {
                icon: PhoneCall,
                title: "Conversation Recording",
                description: "Capture real two-person phone-call conversations using our built-in WebRTC dialer — both sides recorded and mixed automatically.",
                color: "purple"
              },
              {
                icon: Languages,
                title: "Local Language Support",
                description: "Collect data in English, Twi, Ga, Hausa, Dagbani and more. Each project can target specific languages and dialects.",
                color: "green"
              },
              {
                icon: Shield,
                title: "Consented & Compliant",
                description: "All data collected with explicit consent under Ghana's Data Protection Act 2012. Full audit trail for each submission.",
                color: "orange"
              },
              {
                icon: Database,
                title: "Survey Data Collection",
                description: "Run structured surveys alongside voice projects. Combine text, multiple-choice, and rating responses for richer datasets.",
                color: "pink"
              },
              {
                icon: Zap,
                title: "Instant Mobile Money Rewards",
                description: "Pay contributors automatically in GH₵ via MTN Momo or Vodafone Cash the moment their submission is approved.",
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
              Start Earning in 3 Simple Steps
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Create Your Account",
                description: "Register for free in minutes. Browse available voice recording and survey projects posted by AI companies and researchers.",
                image: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?q=80&w=2940&auto=format&fit=crop"
              },
              {
                step: "02",
                title: "Complete Tasks",
                description: "Record your voice reading sentences or in conversation, complete surveys, or contribute other data — from your phone, anywhere.",
                image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=2874&auto=format&fit=crop"
              },
              {
                step: "03",
                title: "Get Paid via Momo",
                description: "Once your submission is reviewed and approved, GH₵ is credited to your balance. Withdraw anytime to Mobile Money.",
                image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2426&auto=format&fit=crop"
              }
            ].map((item, index) => (
              <div key={item.step} className="relative group">
                {index < 2 && (
                  <div className="hidden md:block absolute top-24 left-full w-full h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 z-0" style={{ width: "calc(100% - 2rem)", left: "calc(50% + 1rem)" }}></div>
                )}

                <Card className="relative overflow-hidden border-2 hover:border-blue-300 transition-all hover:shadow-xl">
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
              { number: "25K+", label: "Recordings Collected" },
              { number: "1K+", label: "Active Contributors" },
              { number: "5+", label: "Languages Covered" },
              { number: "GH₵50K+", label: "Paid to Contributors" }
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl sm:text-5xl font-bold mb-2">{stat.number}</div>
                <div className="text-blue-100">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners & Recognition Section */}
      <section className="py-16 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-2">Recognized & Trusted By</p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Our Partners</h2>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-10">
            {/* HustleClickGH */}
            <div className="group flex flex-col items-center gap-3">
              <div className="flex items-center gap-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 px-7 py-5 rounded-2xl shadow-lg group-hover:shadow-xl group-hover:border-blue-200 dark:group-hover:border-blue-900 transition-all">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hustlelogo-clean.png"
                  alt="HustleClickGH"
                  width={52}
                  height={52}
                  className="object-contain rounded-xl"
                />
                <div className="border-l border-slate-200 dark:border-slate-700 pl-4">
                  <p className="text-slate-900 dark:text-white font-bold text-base leading-tight">HUSTLECLICKGH</p>
                  <p className="text-blue-600 text-xs font-semibold tracking-wide mt-0.5">Ghana&apos;s AI Dataset Platform</p>
                </div>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Platform Provider</span>
            </div>

            {/* Huawei Cloud HCPN Partner Badge */}
            <div className="group flex flex-col items-center gap-3">
              <div className="flex items-center gap-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 px-7 py-5 rounded-2xl shadow-lg group-hover:shadow-xl group-hover:border-red-200 dark:group-hover:border-red-900 transition-all">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/huawei-logo.svg"
                  alt="Huawei"
                  width={56}
                  height={56}
                  className="object-contain"
                />
                <div className="border-l border-slate-200 dark:border-slate-700 pl-4">
                  <p className="text-slate-900 dark:text-white font-bold text-base leading-tight">HUAWEI CLOUD</p>
                  <p className="text-red-600 text-xs font-semibold tracking-wide mt-0.5">Certified Partner · HCPN</p>
                </div>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Huawei Cloud Partner Network</span>
            </div>

            {/* Placeholder for future partners */}
            <div className="flex flex-col items-center gap-3 opacity-40">
              <div className="flex items-center justify-center w-48 h-16 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl">
                <span className="text-slate-400 text-sm">Your logo here</span>
              </div>
              <span className="text-xs text-slate-400">Partner with us</span>
            </div>
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
              Datasets for Every AI Need
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              From speech recognition to NLP, our platform delivers the exact format and language your model needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                title: "Speech Recognition & ASR",
                description: "Collect thousands of voice recordings in Ghanaian languages and accents for training robust ASR models that understand local speech.",
                image: "https://images.unsplash.com/photo-1546776310-eef45dd6d63c?q=80&w=2910&auto=format&fit=crop",
                features: ["16 kHz or 48 kHz WAV format", "Mono or stereo channels", "Twi, Ga, Hausa, English speakers"]
              },
              {
                title: "Wake Word & Keyword Detection",
                description: "Collect single-speaker recordings of specific wake words or trigger phrases, precisely formatted for edge-device AI models.",
                image: "https://images.unsplash.com/photo-1589254065878-42c9da997008?q=80&w=2940&auto=format&fit=crop",
                features: ["Configurable bit depth (16/32-bit)", "Single-person recording mode", "Custom prompts per project"]
              },
              {
                title: "Conversation & Dialogue Datasets",
                description: "Record real two-person phone conversations with our built-in WebRTC dialer to train dialogue and conversational AI systems.",
                image: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?q=80&w=2940&auto=format&fit=crop",
                features: ["Both sides auto-mixed and recorded", "Realistic phone-call conditions", "Verified speaker consent"]
              },
              {
                title: "Survey & Annotation Data",
                description: "Run structured surveys alongside voice tasks to collect demographic labels, sentiment annotations, and research questionnaires.",
                image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2940&auto=format&fit=crop",
                features: ["Multiple question types", "Ethics-compliant consent forms", "Export-ready responses"]
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
              <span>What People Say</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Trusted by Researchers & Contributors Alike
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: "Dr. Kwame Asante",
                role: "AI Researcher, University of Ghana",
                content: "We needed Twi speech data at 16 kHz mono for our ASR project. HustleClickGH delivered exactly the format we specified — properly consented and review-approved.",
                rating: 5
              },
              {
                name: "Abena Mensah",
                role: "Voice Contributor, Accra",
                content: "I've earned over GH₵200 just from recording sentences in Twi on my phone. The tasks are simple and the Momo payment arrives the same day my submission is approved.",
                rating: 5
              },
              {
                name: "Kofi Owusu",
                role: "Market Research Analyst",
                content: "The combination of survey data and voice recordings from the same pool of Ghanaian participants gave our client insights they couldn't get anywhere else.",
                rating: 5
              }
            ].map((testimonial) => (
              <Card key={testimonial.name} className="p-6 hover:shadow-xl transition-all">
                <CardContent className="p-0">
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
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Join Ghana&apos;s AI Dataset Community
          </h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            Whether you want to earn money contributing data or collect quality datasets for your AI project — HustleClickGH is your platform.
          </p>

          <div className="flex flex-row gap-4 justify-center">
            <Button size="lg" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/25 text-lg px-8" asChild>
              <Link href="/register">
                Start Earning Today
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-slate-500 text-white hover:bg-white/10 text-lg px-8" asChild>
              <Link href="/login">
                Sign In
              </Link>
            </Button>
          </div>

          <div className="mt-10 flex items-center justify-center gap-4 text-slate-400 text-sm">
            <Shield size={18} className="text-green-400" />
            <span>Free to join · Instant Momo payouts · Ghana Data Protection Act compliant</span>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
