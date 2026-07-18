"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageCropper } from "@/components/image-cropper";
import { BiometricSettings } from "@/components/biometric-settings";
import { VerifiedBadge } from "@/components/verified-badge";
import { Save, Camera, User, Copy, Check, Pencil, ShieldCheck, ChevronRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const profileSchema = z.object({
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  nationalId: z.string().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface UserData {
  userId: string;
  fullName: string;
  verified?: boolean;
  email: string;
  phone: string;
  image: string | null;
  nationalId: string | null;
  balance: number;
  totalEarned: number;
  referralCode: string;
  createdAt: string;
  personalCallCode?: string | null;
}

interface UserStats {
  surveysCompleted: number;
  referrals: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [message, setMessage] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({ surveysCompleted: 0, referrals: 0 });
  const [hasNationalId, setHasNationalId] = useState(false);
  const [copiedCallCode, setCopiedCallCode] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetch("/api/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            setUserData(data.user);
            setUserStats(data.stats || { surveysCompleted: 0, referrals: 0 });
            setHasNationalId(!!data.user.nationalId);
            reset({
              email: data.user.email || "",
              phone: data.user.phone || "",
              nationalId: data.user.nationalId || "",
              newPassword: "",
            });
            if (data.user.image) {
              setProfileImage(data.user.image);
            }
          }
        })
        .catch((error) => {
          console.error("Failed to fetch profile:", error);
          setMessage("Failed to load profile data");
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [status, router, reset]);

  const onSubmit = async (data: ProfileFormData) => {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Update failed");
      }

      setMessage("✓ Profile updated successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: user picks a file → load it into the cropper (no upload yet)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Please select an image file");
      return;
    }
    // Allow larger originals (up to 8MB) since we crop + compress before upload
    if (file.size > 8 * 1024 * 1024) {
      setMessage("Image must be less than 8MB");
      return;
    }

    setMessage("");
    const reader = new FileReader();
    reader.onload = (event) => setCropSrc(event.target?.result as string);
    reader.readAsDataURL(file);
    // reset the input so selecting the same file again re-triggers onChange
    e.target.value = "";
  };

  // Step 2: cropper returns a square data URL → upload it
  const uploadCroppedImage = async (dataUrl: string) => {
    setCropSrc(null);
    setUploadingImage(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!response.ok) throw new Error("Failed to upload image");
      setProfileImage(dataUrl);
      setMessage("✓ Profile picture updated!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  // Re-open the cropper on the current photo to reposition/re-crop it
  const editCurrentImage = () => {
    if (profileImage) setCropSrc(profileImage);
  };

  if (status === "loading" || isFetching) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 border-t-2 border-b-2 border-green-500 rounded-full animate-spin"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Edit Profile</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            Update your account information
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Keep your profile up to date for better service
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {message && (
                <div
                  className={`p-4 rounded-lg text-sm ${
                    message.includes("success") || message.includes("✓")
                      ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                      : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                  }`}
                >
                  {message}
                </div>
              )}

              {/* Profile Picture Upload */}
              <div className="flex flex-col items-center gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="relative">
                  <div className="w-28 h-28 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-4 border-zinc-200 dark:border-zinc-700 shadow-lg">
                    {profileImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img 
                        src={profileImage} 
                        alt="Profile" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User size={48} className="text-zinc-400" />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    title="Upload new photo"
                    className="absolute bottom-0 right-0 w-9 h-9 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white shadow-lg transition-colors disabled:opacity-50"
                  >
                    {uploadingImage ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera size={18} />
                    )}
                  </button>
                  {profileImage && !uploadingImage && (
                    <button
                      type="button"
                      onClick={editCurrentImage}
                      title="Reposition / crop current photo"
                      className="absolute bottom-0 left-0 w-9 h-9 bg-zinc-700 hover:bg-zinc-800 rounded-full flex items-center justify-center text-white shadow-lg transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{userData?.fullName}</p>
                  {userData?.verified && <VerifiedBadge withLabel />}
                </div>
                <p className="text-sm text-zinc-500 text-center">
                  {profileImage
                    ? "Camera to upload a new photo · pencil to reposition the current one"
                    : "Click the camera to upload a profile picture"}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Full Name - Read Only */}
                <div className="space-y-2">
                  <label htmlFor="fullName" className="text-sm font-medium text-foreground">
                    Full Name <span className="text-zinc-500">(Cannot be changed)</span>
                  </label>
                  <Input
                    id="fullName"
                    value={userData?.fullName || ""}
                    disabled={true}
                    className="bg-zinc-100 dark:bg-zinc-800 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    {...register("email")}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-foreground">
                    Phone Number
                  </label>
                  <Input
                    id="phone"
                    placeholder="+233 XX XXX XXXX"
                    {...register("phone")}
                    disabled={isLoading}
                  />
                  {errors.phone && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.phone.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="nationalId" className="text-sm font-medium text-foreground">
                    National ID Number {hasNationalId ? (
                      <span className="text-zinc-500">(Cannot be changed once submitted)</span>
                    ) : (
                      <span className="text-zinc-500">(Optional)</span>
                    )}
                  </label>
                  <Input
                    id="nationalId"
                    placeholder="GHA-XXXXXXXXX-X"
                    {...register("nationalId")}
                    disabled={isLoading || hasNationalId}
                    className={hasNationalId ? "bg-zinc-100 dark:bg-zinc-800 cursor-not-allowed" : ""}
                  />
                  {hasNationalId && (
                    <p className="text-xs text-zinc-500">Contact support if you need to update your National ID</p>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
                    New Password <span className="text-zinc-500">(Optional - leave blank to keep current)</span>
                  </label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password to change"
                    {...register("newPassword")}
                    disabled={isLoading}
                  />
                  {errors.newPassword && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.newPassword.message}</p>
                  )}
                </div>
              </div>

              <Button type="submit" size="lg" disabled={isLoading}>
                <Save size={20} />
                {isLoading ? "Updating..." : "Update Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-500">User ID</p>
                <p className="text-lg font-semibold text-foreground">{userData?.userId || "Loading..."}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Member Since</p>
                <p className="text-lg font-semibold text-foreground">
                  {userData?.createdAt 
                    ? new Date(userData.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
                    : "Loading..."}
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Current Balance</p>
                <p className="text-lg font-semibold text-green-600">GH₵{(userData?.balance || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Earnings</p>
                <p className="text-lg font-semibold text-green-600">GH₵{(userData?.totalEarned || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Surveys Completed</p>
                <p className="text-lg font-semibold text-foreground">{userStats.surveysCompleted}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Referral Code</p>
                <p className="text-lg font-semibold text-blue-600">{userData?.referralCode || "Loading..."}</p>
              </div>
              {userData?.personalCallCode && (
                <div className="md:col-span-2">
                  <p className="text-sm text-zinc-500 mb-1">Your Call Code</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-bold tracking-widest text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-4 py-2 rounded-xl border border-purple-200 dark:border-purple-700 font-mono">
                      {userData.personalCallCode}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(userData.personalCallCode!);
                        setCopiedCallCode(true);
                        setTimeout(() => setCopiedCallCode(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-sm font-medium transition-colors"
                    >
                      {copiedCallCode ? <Check size={15} /> : <Copy size={15} />}
                      {copiedCallCode ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1.5">Share this code so others can call you directly</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Biometric login */}
        <BiometricSettings />

        {/* Data & Privacy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-green-600" /> Data &amp; Privacy
            </CardTitle>
            <CardDescription>
              Review your agreements, export your data, or delete your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/account/data"
              className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="font-medium text-foreground">Manage data &amp; privacy</p>
                  <p className="text-sm text-zinc-500">Consent, data export and account deletion</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-zinc-400" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onCropComplete={uploadCroppedImage}
        />
      )}
    </DashboardLayout>
  );
}
