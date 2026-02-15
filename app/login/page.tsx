"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogIn, Shield, User, Eye, EyeOff, Sparkles, ArrowLeft, ArrowRight, CheckCircle2, UserPlus, Gift, Wallet, TrendingUp, Users, Home } from "lucide-react";

const loginSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  referralId: z.string().optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
    .regex(/[0-9]/, "Password must contain at least 1 number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least 1 symbol"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;
type UserRole = "user" | "admin";

export default function AuthPage() {
  const router = useRouter();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("user");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        userId: data.userId,
        password: data.password,
        selectedRole: selectedRole,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes("mismatch") || result.error.includes("Account type")) {
          setError("Account type mismatch. Please select the correct account type (User or Admin).");
        } else {
          setError("Invalid User ID or password");
        }
        return;
      }

      if (result?.ok) {
        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json();
        
        if (sessionData?.user?.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Registration failed");
      }

      const signInResult = await signIn("credentials", {
        userId: result.userId,
        password: data.password,
        redirect: false,
      });

      if (signInResult?.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setIsFlipped(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const flipToRegister = () => {
    setError("");
    setIsFlipped(true);
  };

  const flipToLogin = () => {
    setError("");
    setIsFlipped(false);
  };

  const loginFeatures = [
    "Create powerful surveys easily",
    "Real-time response analytics",
    "Secure & private data collection",
    "24/7 Support available"
  ];

  const registerBenefits = [
    { icon: TrendingUp, text: "Real-time analytics dashboard" },
    { icon: Gift, text: "Free to start, no credit card" },
    { icon: Users, text: "Join 500+ organizations" },
    { icon: Wallet, text: "Export data in any format" }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-100 via-white to-zinc-100 dark:from-zinc-950 dark:via-black dark:to-zinc-950 p-4 overflow-hidden">
      {/* 3D Flip Container */}
      <div className="w-full max-w-6xl h-[700px] relative" style={{ perspective: "2000px" }}>
        <div 
          className={`relative w-full h-full transition-transform duration-700 ease-in-out`}
          style={{ 
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
          }}
        >
          {/* ==================== LOGIN SIDE (FRONT) ==================== */}
          <div 
            className="absolute inset-0 w-full h-full rounded-3xl overflow-hidden shadow-2xl"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="flex h-full">
              {/* Left Side - Image & Branding */}
              <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1551434678-e076c223a692?q=80&w=2940&auto=format&fit=crop"
                  alt="Modern workspace"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/90 via-purple-600/80 to-pink-600/90"></div>
                
                <div className="relative z-10 flex flex-col justify-between p-10 text-white">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                      <Sparkles size={28} />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">HustleClickGH</h1>
                      <p className="text-sm text-white/70">Data Collection Made Simple</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h2 className="text-3xl font-bold leading-tight mb-3">
                        Welcome back to your dashboard
                      </h2>
                      <p className="text-base text-white/80 max-w-md">
                        Log in to create surveys, analyze responses, and manage your data collection.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {loginFeatures.map((feature, index) => (
                        <div key={index} className="flex items-center gap-3 text-white/90">
                          <CheckCircle2 size={18} className="text-green-400" />
                          <span className="text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <div className="text-2xl font-bold">500+</div>
                      <div className="text-xs text-white/70">Organizations</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">10K+</div>
                      <div className="text-xs text-white/70">Surveys Created</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">500K+</div>
                      <div className="text-xs text-white/70">Responses</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side - Login Form */}
              <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-zinc-950">
                <div className="w-full max-w-md space-y-6">
                  <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                      <Sparkles size={24} className="text-white" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-foreground">HustleClickGH</h1>
                    </div>
                  </div>

                  <div className="text-center lg:text-left">
                    <h2 className="text-2xl font-bold text-foreground mb-2">Sign In</h2>
                    <p className="text-zinc-500 text-sm">
                      Don&apos;t have an account?{" "}
                      <button 
                        onClick={flipToRegister}
                        className="text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 group"
                      >
                        Create one
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </p>
                  </div>

                  {/* Role Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Account Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedRole("user")}
                        className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-300 ${
                          selectedRole === "user"
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/20"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
                        }`}
                      >
                        {selectedRole === "user" && (
                          <CheckCircle2 size={14} className="absolute top-2 right-2 text-blue-600" />
                        )}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          selectedRole === "user" ? "bg-gradient-to-br from-blue-500 to-blue-600" : "bg-zinc-100 dark:bg-zinc-800"
                        }`}>
                          <User size={20} className={selectedRole === "user" ? "text-white" : "text-zinc-400"} />
                        </div>
                        <span className={`text-xs font-semibold ${selectedRole === "user" ? "text-blue-600" : "text-zinc-500"}`}>User</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setSelectedRole("admin")}
                        className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-300 ${
                          selectedRole === "admin"
                            ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20 shadow-lg shadow-purple-500/20"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
                        }`}
                      >
                        {selectedRole === "admin" && (
                          <CheckCircle2 size={14} className="absolute top-2 right-2 text-purple-600" />
                        )}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          selectedRole === "admin" ? "bg-gradient-to-br from-purple-500 to-purple-600" : "bg-zinc-100 dark:bg-zinc-800"
                        }`}>
                          <Shield size={20} className={selectedRole === "admin" ? "text-white" : "text-zinc-400"} />
                        </div>
                        <span className={`text-xs font-semibold ${selectedRole === "admin" ? "text-purple-600" : "text-zinc-500"}`}>Admin</span>
                      </button>
                    </div>
                  </div>

                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                    {error && !isFlipped && (
                      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm border border-red-200 dark:border-red-800">
                        {error}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label htmlFor="userId" className="text-xs font-medium text-foreground">User ID</label>
                      <Input
                        id="userId"
                        placeholder="Enter your User ID"
                        className="h-11 rounded-xl"
                        {...loginForm.register("userId")}
                        disabled={isLoading}
                      />
                      {loginForm.formState.errors.userId && (
                        <p className="text-xs text-red-600">{loginForm.formState.errors.userId.message}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="password" className="text-xs font-medium text-foreground">Password</label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className="h-11 rounded-xl pr-10"
                          {...loginForm.register("password")}
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      className={`w-full h-11 rounded-xl font-semibold ${
                        selectedRole === "admin"
                          ? "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                          : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                      }`} 
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                          Signing in...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <LogIn size={18} />
                          Sign In
                        </span>
                      )}
                    </Button>

                    {/* Divider */}
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white dark:bg-zinc-950 px-3 text-zinc-500">Or continue with</span>
                      </div>
                    </div>

                    {/* OAuth Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 h-11 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Google</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => signIn("apple", { callbackUrl: "/dashboard" })}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 h-11 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-black hover:bg-zinc-900 transition-colors disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                        </svg>
                        <span className="text-sm font-medium text-white">Apple</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* ==================== REGISTER SIDE (BACK - MIRRORED) ==================== */}
          <div 
            className="absolute inset-0 w-full h-full rounded-3xl overflow-hidden shadow-2xl"
            style={{ 
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)"
            }}
          >
            <div className="flex h-full">
              {/* Left Side - Register Form (Mirrored) */}
              <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-zinc-950 overflow-y-auto">
                <div className="w-full max-w-md space-y-5">
                  <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center">
                      <Sparkles size={24} className="text-white" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-foreground">HustleClickGH</h1>
                    </div>
                  </div>

                  <div className="text-center lg:text-left">
                    <h2 className="text-2xl font-bold text-foreground mb-2">Create Account</h2>
                    <p className="text-zinc-500 text-sm">
                      Already have an account?{" "}
                      <button 
                        onClick={flipToLogin}
                        className="text-green-600 hover:text-green-700 font-semibold inline-flex items-center gap-1 group"
                      >
                        <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                        Sign in
                      </button>
                    </p>
                  </div>

                  <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-3">
                    {error && isFlipped && (
                      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm border border-red-200 dark:border-red-800">
                        {error}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Full Name</label>
                      <Input
                        placeholder="John Doe"
                        className="h-10 rounded-xl"
                        {...registerForm.register("fullName")}
                        disabled={isLoading}
                      />
                      {registerForm.formState.errors.fullName && (
                        <p className="text-xs text-red-600">{registerForm.formState.errors.fullName.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Email</label>
                        <Input
                          type="email"
                          placeholder="john@example.com"
                          className="h-10 rounded-xl"
                          {...registerForm.register("email")}
                          disabled={isLoading}
                        />
                        {registerForm.formState.errors.email && (
                          <p className="text-xs text-red-600">{registerForm.formState.errors.email.message}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Phone</label>
                        <Input
                          placeholder="+233 XX XXX XXXX"
                          className="h-10 rounded-xl"
                          {...registerForm.register("phone")}
                          disabled={isLoading}
                        />
                        {registerForm.formState.errors.phone && (
                          <p className="text-xs text-red-600">{registerForm.formState.errors.phone.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Referral ID <span className="text-zinc-400">(Optional)</span>
                      </label>
                      <Input
                        placeholder="Enter referral code"
                        className="h-10 rounded-xl"
                        {...registerForm.register("referralId")}
                        disabled={isLoading}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Password</label>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Create password"
                            className="h-10 rounded-xl pr-9"
                            {...registerForm.register("password")}
                            disabled={isLoading}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {registerForm.formState.errors.password && (
                          <p className="text-xs text-red-600">{registerForm.formState.errors.password.message}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Confirm</label>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm password"
                            className="h-10 rounded-xl pr-9"
                            {...registerForm.register("confirmPassword")}
                            disabled={isLoading}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400"
                          >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {registerForm.formState.errors.confirmPassword && (
                          <p className="text-xs text-red-600">{registerForm.formState.errors.confirmPassword.message}</p>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] text-zinc-500">
                      Password: 8+ chars, 1 uppercase, 1 number, 1 symbol
                    </p>

                    <Button 
                      type="submit" 
                      className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" 
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                          Creating...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <UserPlus size={18} />
                          Create Account
                        </span>
                      )}
                    </Button>

                    {/* Divider */}
                    <div className="relative my-3">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white dark:bg-zinc-950 px-3 text-zinc-500">Or sign up with</span>
                      </div>
                    </div>

                    {/* OAuth Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Google</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => signIn("apple", { callbackUrl: "/dashboard" })}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-black hover:bg-zinc-900 transition-colors disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                        </svg>
                        <span className="text-sm font-medium text-white">Apple</span>
                      </button>
                    </div>
                  </form>

                  <p className="text-[10px] text-zinc-500 text-center">
                    By signing up, you agree to our Terms & Privacy Policy
                  </p>
                </div>
              </div>

              {/* Right Side - Image & Branding (Mirrored) */}
              <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2940&auto=format&fit=crop"
                  alt="Team collaboration"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-bl from-green-600/90 via-emerald-600/80 to-teal-600/90"></div>
                
                <div className="relative z-10 flex flex-col justify-between p-10 text-white">
                  <div className="flex items-center gap-3 justify-end">
                    <div>
                      <h1 className="text-2xl font-bold text-right">HustleClickGH</h1>
                      <p className="text-sm text-white/70 text-right">Data Collection Made Simple</p>
                    </div>
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                      <Sparkles size={28} />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="text-right">
                      <h2 className="text-3xl font-bold leading-tight mb-3">
                        Start collecting data today
                      </h2>
                      <p className="text-base text-white/80">
                        Create your free account and start building surveys.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {registerBenefits.map((benefit, index) => (
                        <div key={index} className="flex items-center gap-3 text-white/90 justify-end">
                          <span className="text-sm">{benefit.text}</span>
                          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                            <benefit.icon size={18} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5">
                    <p className="text-white/90 italic text-sm mb-3 text-right">
                      &quot;This platform made my research data collection so much easier. Highly recommend!&quot;
                    </p>
                    <div className="flex items-center gap-3 justify-end">
                      <div className="text-right">
                        <div className="font-semibold text-sm">Dr. Ama Kofi</div>
                        <div className="text-xs text-white/70">Researcher, UG</div>
                      </div>
                      <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold">AK</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Home Button */}
      <Link 
        href="/" 
        className="fixed top-6 left-6 z-50 w-12 h-12 bg-white dark:bg-zinc-900 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:scale-110 hover:shadow-xl transition-all duration-300 group"
      >
        <Home size={20} className="text-zinc-600 dark:text-zinc-400 group-hover:text-blue-600 transition-colors" />
      </Link>
    </div>
  );
}
