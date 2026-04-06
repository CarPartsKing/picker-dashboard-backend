import React from "react";
import { Link } from "wouter";
import { 
  useGetLeaderboard, 
  getGetLeaderboardQueryKey
} from "@workspace/api-client-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Award, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { subDays, format, startOfDay, endOfDay } from "date-fns";

export default function Leaderboard() {
  const [timeRange, setTimeRange] = React.useState<string>("all-time");

  const getParams = () => {
    const today = new Date();
    if (timeRange === "today") {
      return {
        startDate: startOfDay(today).toISOString(),
        endDate: endOfDay(today).toISOString()
      };
    }
    if (timeRange === "week") {
      return {
        startDate: startOfDay(subDays(today, 7)).toISOString(),
        endDate: endOfDay(today).toISOString()
      };
    }
    if (timeRange === "month") {
      return {
        startDate: startOfDay(subDays(today, 30)).toISOString(),
        endDate: endOfDay(today).toISOString()
      };
    }
    return {};
  };

  const params = getParams();

  const { data: leaderboard, isLoading } = useGetLeaderboard(
    params,
    { query: { queryKey: getGetLeaderboardQueryKey(params) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-8 w-8 text-amber-500" />
            Leaderboard
          </h1>
          <p className="text-muted-foreground">Rankings based on picker efficiency score and throughput.</p>
        </div>

        <div className="w-48">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger>
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="all-time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : leaderboard && leaderboard.length >= 3 ? (
          <>
            {/* Rank 2 */}
            <Card className="relative overflow-hidden border-slate-200 dark:border-slate-800 transform md:translate-y-4 shadow-sm bg-gradient-to-b from-card to-slate-50/50 dark:to-slate-900/50">
              <div className="absolute top-0 w-full h-1 bg-slate-300 dark:bg-slate-700" />
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-full mb-2">
                    <Medal className="h-8 w-8 text-slate-400" />
                  </div>
                  <Link href={`/pickers/${leaderboard[1].pickerId}`} className="font-bold text-xl hover:underline">
                    {leaderboard[1].pickerName}
                  </Link>
                  <div className="text-sm font-mono text-muted-foreground">{leaderboard[1].employeeId}</div>
                  <div className="text-3xl font-bold font-mono text-slate-600 dark:text-slate-300 my-2">
                    {leaderboard[1].efficiencyScore.toFixed(1)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <strong>{leaderboard[1].totalPicks.toLocaleString()}</strong> picks
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rank 1 */}
            <Card className="relative overflow-hidden border-amber-200 dark:border-amber-800 shadow-md shadow-amber-500/10 dark:shadow-amber-500/5 bg-gradient-to-b from-card to-amber-50/50 dark:to-amber-950/20 z-10">
              <div className="absolute top-0 w-full h-1 bg-amber-400" />
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  <div className="bg-amber-100 dark:bg-amber-900/40 p-4 rounded-full mb-2 shadow-inner">
                    <Trophy className="h-10 w-10 text-amber-500" />
                  </div>
                  <Link href={`/pickers/${leaderboard[0].pickerId}`} className="font-bold text-2xl hover:underline">
                    {leaderboard[0].pickerName}
                  </Link>
                  <div className="text-sm font-mono text-muted-foreground">{leaderboard[0].employeeId}</div>
                  <div className="text-4xl font-bold font-mono text-amber-600 dark:text-amber-500 my-2">
                    {leaderboard[0].efficiencyScore.toFixed(1)}
                  </div>
                  <div className="text-sm font-medium">
                    <span className="text-amber-600 dark:text-amber-500">{leaderboard[0].totalPicks.toLocaleString()}</span> total picks
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rank 3 */}
            <Card className="relative overflow-hidden border-amber-100 dark:border-amber-900/50 transform md:translate-y-8 shadow-sm bg-gradient-to-b from-card to-orange-50/30 dark:to-orange-950/10">
              <div className="absolute top-0 w-full h-1 bg-amber-700/40 dark:bg-amber-700/60" />
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full mb-2">
                    <Award className="h-8 w-8 text-amber-700/60 dark:text-amber-600" />
                  </div>
                  <Link href={`/pickers/${leaderboard[2].pickerId}`} className="font-bold text-xl hover:underline">
                    {leaderboard[2].pickerName}
                  </Link>
                  <div className="text-sm font-mono text-muted-foreground">{leaderboard[2].employeeId}</div>
                  <div className="text-3xl font-bold font-mono text-amber-800/70 dark:text-amber-700 my-2">
                    {leaderboard[2].efficiencyScore.toFixed(1)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <strong>{leaderboard[2].totalPicks.toLocaleString()}</strong> picks
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="col-span-3 text-center p-12 text-muted-foreground border-2 border-dashed rounded-xl">
            Not enough data to show top 3 pickers.
          </div>
        )}
      </div>

      <div className="border rounded-md bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16 text-center">Rank</TableHead>
              <TableHead>Picker</TableHead>
              <TableHead>ID</TableHead>
              <TableHead className="text-right">Total Picks</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Avg Duration</TableHead>
              <TableHead className="text-right">Efficiency Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-6 mx-auto rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : leaderboard?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No leaderboard data available for the selected period.
                </TableCell>
              </TableRow>
            ) : (
              leaderboard?.map((entry) => (
                <TableRow key={entry.pickerId} className={entry.rank <= 3 ? "bg-muted/20" : ""}>
                  <TableCell className="text-center font-bold">
                    {entry.rank === 1 ? (
                      <div className="bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-500 h-8 w-8 rounded-full flex items-center justify-center mx-auto shadow-sm border border-amber-200 dark:border-amber-800">1</div>
                    ) : entry.rank === 2 ? (
                      <div className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 h-8 w-8 rounded-full flex items-center justify-center mx-auto shadow-sm border border-slate-200 dark:border-slate-700">2</div>
                    ) : entry.rank === 3 ? (
                      <div className="bg-orange-50 text-amber-700/70 dark:bg-orange-950/30 dark:text-amber-700 h-8 w-8 rounded-full flex items-center justify-center mx-auto shadow-sm border border-orange-100 dark:border-orange-900/50">3</div>
                    ) : (
                      <div className="text-muted-foreground h-8 w-8 flex items-center justify-center mx-auto">{entry.rank}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/pickers/${entry.pickerId}`} className="hover:underline flex items-center gap-2">
                      {entry.pickerName}
                      {entry.rank === 1 && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {entry.employeeId}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {entry.totalPicks.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.totalItems.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {entry.avgDurationSeconds ? `${Math.round(entry.avgDurationSeconds)}s` : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={entry.rank <= 3 ? "default" : "secondary"} className={`font-mono text-sm ${
                      entry.rank === 1 ? "bg-amber-500 hover:bg-amber-600 text-white border-transparent" :
                      entry.rank === 2 ? "bg-slate-400 hover:bg-slate-500 text-white border-transparent" :
                      entry.rank === 3 ? "bg-amber-700/60 hover:bg-amber-700/70 text-white border-transparent" :
                      ""
                    }`}>
                      {entry.efficiencyScore.toFixed(1)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}