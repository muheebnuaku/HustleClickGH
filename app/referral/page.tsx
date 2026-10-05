"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader, StatCard } from "@/components/ui/page-kit";
import { UsersRound } from "lucide-react";
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
  const [info, setInfo] = useState<ReferralInfo>({ isManager: false, referralCap: 15, commissionPercent: null, commissionTotal: 0, commissionCount: 0 });

  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback((showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    return Promise.all([
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
          referralCap: referralsData.referralCap ?? 15,
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
        setRefreshing(false);
      });
  }, [session]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router]);

  const referralLink = `https://hustleclickgh.com/register?ref=${referralCode}`;
  const totalReferrals = referrals.length;
  const totalEarnings = referrals.reduce((sum, r) => sum + r.earned, 0);
  // Contributors' list is capped to match their actual referral cap (so the
  // display can never show more than they're really allowed); managers see
  // everyone (unlimited). Was previously hardcoded to 50 here even though
  // the backend cap is a shared, changeable constant — see REFERRAL_CAP.
  const displayedReferrals = info.isManager ? referrals : referrals.slice(0, info.referralCap ?? 15);

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
        <PageHeader
          icon={UsersRound}
          title="Refer & Earn"
          description={info.isManager ? (
            <>Unlimited referrals — plus <strong>{info.commissionPercent}% commission</strong> whenever someone you referred is rewarded on a project.</>
          ) : (
            <>Invite friends and earn {formatCurrency(SITE_CONFIG.survey.referralBonus)} for each successful referral.</>
          )}
        />

        {/* Manager commission summary — 2x2 grid on phones/tablets (fits
            without crowding), one row on large screens. Compact padding and
            responsive text sizing so the numbers never fight the card for
            room at 2-per-row widths. */}
        {info.isManager && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Percent} tone="green" label="Commission rate" value={`${info.commissionPercent}%`} />
            <StatCard icon={Gift} tone="green" label="Commission earned" value={formatCurrency(info.commissionTotal)} />
            <StatCard icon={UsersRound} tone="sky" label="Approvals" value={info.commissionCount} />
            <StatCard icon={InfinityIcon} tone="blue" label="Referral limit" value="Unlimited" />
          </div>
        )}

        {/* Referral stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={UsersRound} tone="blue" label="Total referrals" value={totalReferrals} />
          <StatCard icon={InfinityIcon} tone="green" label="Referral limit" value={info.isManager ? "Unlimited" : `${totalReferrals}/${info.referralCap ?? 15}`} />
          <StatCard icon={Gift} tone="purple" label="Total earnings" value={formatCurrency(totalEarnings)} />
          <StatCard icon={Gift} tone="amber" label={info.isManager ? "Bonus" : "To bonus"} value={info.isManager ? "—" : `${Math.min(totalReferrals, SITE_CONFIG.survey.referralMilestone)}/${SITE_CONFIG.survey.referralMilestone}`} />
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
              <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
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
                    className="flex items-center justify-between gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{referral.name || "New member"}</p>
                      <p className="text-sm text-zinc-500">Joined on {formatDate(referral.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
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
