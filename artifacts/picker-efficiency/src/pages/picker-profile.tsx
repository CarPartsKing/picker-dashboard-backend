import { useParams } from "wouter";
import { Link } from "wouter";
import { 
  useGetPickerStats, 
  getGetPickerStatsQueryKey,
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
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
import { format, parseISO } from "date-fns";
import { ArrowLeft, Activity, Target, Timer, Package, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PickerProfile() {
  const params = useParams();
  const id = parseInt(params.id || "0");

  const { data: stats, isLoading } = useGetPickerStats(id, {}, {
    query: { 
      enabled: !!id,
      queryKey: getGetPickerStatsQueryKey(id, {})
    }
  });

  if (!id) {
    return <div>Invalid ID</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/pickers">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isLoading ? <Skeleton className="h-9 w-48" /> : stats?.pickerName}
          </h1>
          <div className="text-muted-foreground font-mono mt-1 flex items-center gap-2">
            {isLoading ? <Skeleton className="h-4 w-24" /> : stats?.employeeId}
            {stats?.zone && (
              <Badge variant="secondary" className="font-sans">
                <MapPin className="h-3 w-3 mr-1" />
                Zone: {stats.zone}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Efficiency Score</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold font-mono text-blue-600 dark:text-blue-500">
                {stats?.efficiencyScore.toFixed(1) || "0.0"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Picks</CardTitle>
            <Target className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold font-mono">
                {stats?.totalPicks.toLocaleString() || "0"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold font-mono">
                {stats?.totalItems.toLocaleString() || "0"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Pick Duration</CardTitle>
            <Timer className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold font-mono">
                {stats?.avgDurationSeconds ? `${Math.round(stats.avgDurationSeconds)}s` : "N/A"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 10 pick operations logged for this picker</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : stats?.recentPicks?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No recent activity found.
                    </TableCell>
                  </TableRow>
                ) : (
                  stats?.recentPicks?.map((pick) => (
                    <TableRow key={pick.id}>
                      <TableCell className="font-mono text-sm">
                        {format(parseISO(pick.pickedAt), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell className="font-bold">{pick.itemSku}</TableCell>
                      <TableCell className="text-right">{pick.quantity}</TableCell>
                      <TableCell>
                        {pick.zone ? (
                          <Badge variant="outline">{pick.zone}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {pick.durationSeconds ? `${pick.durationSeconds}s` : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="mt-4 flex justify-end">
            <Link href={`/picks?pickerId=${id}`}>
              <Button variant="outline">View Full Pick History</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}