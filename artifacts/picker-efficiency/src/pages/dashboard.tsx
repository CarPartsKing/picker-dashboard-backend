import { 
  useGetAnalyticsSummary, 
  getGetAnalyticsSummaryQueryKey,
  useGetDailyTrend,
  getGetDailyTrendQueryKey,
  useGetLeaderboard,
  getGetLeaderboardQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Activity, Package, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary({
    query: { queryKey: getGetAnalyticsSummaryQueryKey() }
  });

  const { data: trends, isLoading: isLoadingTrends } = useGetDailyTrend(
    { days: 14 },
    { query: { queryKey: getGetDailyTrendQueryKey({ days: 14 }) } }
  );

  const { data: leaderboard, isLoading: isLoadingLeaderboard } = useGetLeaderboard(
    {},
    { query: { queryKey: getGetLeaderboardQueryKey({}) } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operations Dashboard</h1>
        <p className="text-muted-foreground">Overview of warehouse picker efficiency and throughput.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Picks (Today)</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold font-mono">{summary?.totalPicksToday.toLocaleString() ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg {summary?.avgPicksPerPickerToday.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? 0} per picker
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Pickers</CardTitle>
            <Users className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold font-mono">
                  {summary?.activePickers ?? 0} <span className="text-muted-foreground text-sm font-sans font-normal">/ {summary?.totalPickers ?? 0}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Currently on the floor
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Performer</CardTitle>
            <Trophy className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold truncate">{summary?.topPickerToday || 'N/A'}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary?.topPickerTodayCount?.toLocaleString() ?? 0} picks today
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Throughput</CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold font-mono">{summary?.totalPicksThisWeek.toLocaleString() ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total picks this week
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Throughput Trend (14 Days)</CardTitle>
            <CardDescription>Daily pick volume across all active zones</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {isLoadingTrends ? (
              <div className="h-full w-full flex items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : trends && trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => format(parseISO(val), 'MMM d')}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                  />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      color: 'hsl(var(--card-foreground))'
                    }}
                    labelFormatter={(val) => format(parseISO(val as string), 'MMM d, yyyy')}
                  />
                  <Bar 
                    dataKey="totalPicks" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                    name="Total Picks"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Pickers</CardTitle>
              <CardDescription>Highest efficiency scores</CardDescription>
            </div>
            <Link href="/leaderboard" className="text-sm text-primary hover:underline font-medium">
              View All
            </Link>
          </CardHeader>
          <CardContent>
            {isLoadingLeaderboard ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-6 w-12" />
                  </div>
                ))}
              </div>
            ) : leaderboard && leaderboard.length > 0 ? (
              <div className="space-y-5">
                {leaderboard.slice(0, 5).map((entry, index) => (
                  <div key={entry.pickerId} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mr-4 ${
                      index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500' :
                      index === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' :
                      index === 2 ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <Link href={`/pickers/${entry.pickerId}`} className="font-medium text-sm hover:underline truncate block">
                        {entry.pickerName}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">
                        {entry.employeeId}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-green-600 dark:text-green-500">
                        {entry.efficiencyScore.toFixed(1)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.totalPicks.toLocaleString()} picks
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-md">
                No leaderboard data
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}