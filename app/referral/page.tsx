"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Share2, RefreshCw, Gift, Percent, Infinity as InfinityIcon } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SITE_CONFIG } from "@/lib/constants";

interface Referral {
  id: string;
  name: string;
  date: string;
  earned: number;
}

interface ReferralInfo {
  isManager: boolean;
  referralCap: number | null;
  commissionPercent: number | null;
  commissionTotal: number;
  commissionCount: number;
}

export default function ReferralPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralCode, setReferralCode] = useState("");
  const [info, setInfo] = useState<ReferralInfo>({ isManager: false, referralCap: 50, commissionPercent: null, commissionTotal: 0, commissionCount: 0 });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      Promise.all([
        fetch("/api/referrals"),
        fetch("/api/profile"),
      ])
        .then(([referralsRes, profileRes]) => Promise.all([
          referralsRes.json(),
          profileRes.json(),
        ]))
        .then(([referralsData, profileData]) => {
          setReferrals(referralsData.referrals || []);
          setInfo({
            isManager: !!referralsData.isManager,
            referralCap: referralsData.referralCap ?? 50,
            commissionPercent: referralsData.commissionPercent ?? null,
            commissionTotal: referralsData.commissionTotal ?? 0,
            commissionCount: referralsData.commissionCount ?? 0,
          });
          setReferralCode(profileData.referralCode || session?.user?.userId || "");
        })
        .catch((error) => {
          console.error("Failed to fetch data:", error);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [status, router, session]);

  const referralLink = `https://hustleclickgh.com/register?ref=${referralCode}`;
  const totalReferrals = referrals.length;
  const totalEarnings = referrals.reduce((sum, r) => sum + r.earned, 0);
  // Contributors cap the list at 50; managers see everyone (unlimited).
  const displayedReferrals = info.isManager ? referrals : referrals.slice(0, 50);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join HustleClickGH",
          text: `Join me on HustleClickGH and earn money by taking surveys! Use my referral link:`,
          url: referralLink,
        });
      } catch {
        console.log("Share cancelled");
      }
    } else {
      handleCopy();
    }
  };

  if (status === "loading" || isLoading) {
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
          <h1 className="text-3xl font-bold text-foreground">Refer & Earn</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            {info.isManager ? (
              <>Unlimited referrals — plus <strong>{info.commissionPercent}% commission</strong> whenever someone you referred is rewarded on a project.</>
            ) : (
              <>Invite friends and earn {formatCurrency(SITE_CONFIG.survey.referralBonus)} for each successful referral</>
            )}
          </p>
        </div>

        {/* Manager commission summary */}
        {info.isManager && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1"><Percent size={14} /> Your commission rate</p>
                <p className="text-4xl font-bold text-emerald-600 my-2">{info.commissionPercent}%</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-green-700 dark:text-green-400">Commission earned</p>
                <p className="text-4xl font-bold text-green-600 my-2">{formatCurrency(info.commissionTotal)}</p>
                <p className="text-xs text-zinc-500">from {info.commissionCount} approval{info.commissionCount === 1 ? "" : "s"}</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center justify-center gap-1"><InfinityIcon size={14} /> Referral limit</p>
                <p className="text-4xl font-bold text-blue-600 my-2">Unlimited</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Referral Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-blue-700 dark:text-blue-400">Total Referrals</p>
                <p className="text-4xl font-bold text-blue-600 my-2">{totalReferrals}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-green-700 dark:text-green-400">Successful Referrals</p>
                <p className="text-4xl font-bold text-green-600 my-2">{totalReferrals}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-purple-700 dark:text-purple-400">Total Earnings</p>
                <p className="text-4xl font-bold text-purple-600 my-2">{formatCurrency(totalEarnings)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referral Link */}
        <Card>
          <CardHeader>
            <CardTitle>Your Referral Link</CardTitle>
            <CardDescription>
              Share this link with friends and family to earn rewards
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={referralLink}
                readOnly
                className="font-mono text-sm min-w-0 flex-1"
              />
              <div className="flex gap-2">
                <Button onClick={handleCopy} variant="outline" className="flex-1 sm:flex-none">
                  <Copy size={18} />
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button onClick={handleShare} className="flex-1 sm:flex-none">
                  <Share2 size={18} />
                  Share
                </Button>
              </div>
            </div>

            {/* Progress to Milestone — contributors only */}
            {!info.isManager && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">Referral Progress</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {totalReferrals}/{SITE_CONFIG.survey.referralMilestone} referrals
                  </p>
                </div>
                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{
                      width: `${Math.min(100, (totalReferrals / SITE_CONFIG.survey.referralMilestone) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                  <Gift size={14} />
                  Earn a special bonus when you reach {SITE_CONFIG.survey.referralMilestone} referrals!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <span className="font-bold text-blue-600">1</span>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Share Your Link</h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Copy your unique referral link and share it with friends via WhatsApp, social media, or email
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <span className="font-bold text-green-600">2</span>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Friend Registers</h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    When your friend signs up using your link and completes registration, they become your referral
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                  <span className="font-bold text-purple-600">3</span>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Earn Instantly</h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    You earn {formatCurrency(SITE_CONFIG.survey.referralBonus)} immediately added to your balance for each successful referral
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Your Referrals */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your Referrals</CardTitle>
                <CardDescription>People who joined using your link</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <RefreshCw size={16} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {referrals.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No referrals yet. Start sharing your link!
              </div>
            ) : (
              <div className="space-y-3">
                {displayedReferrals.map((referral) => (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                  >
                    <div>
                      <p className="font-medium text-foreground">{referral.name || "New member"}</p>
                      <p className="text-sm text-zinc-500">Joined on {formatDate(referral.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">+{formatCurrency(referral.earned)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`flex h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 ${className}`}
      {...props}
    />
  );
}
