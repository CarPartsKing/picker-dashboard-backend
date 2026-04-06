import React from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { 
  useListPicks, 
  getListPicksQueryKey,
  useListPickers,
  getListPickersQueryKey,
  useCreatePick,
  useDeletePick
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { Plus, Search, Filter, Trash2, ArrowUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

const pickSchema = z.object({
  pickerId: z.coerce.number().min(1, "Picker is required"),
  itemSku: z.string().min(2, "SKU is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  zone: z.string().optional().nullable(),
  pickedAt: z.string().min(1, "Time is required"),
  durationSeconds: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export default function PicksLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterPicker, setFilterPicker] = React.useState<string>("all");
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  
  // Extract pickerId from URL if available
  const urlParams = new URLSearchParams(window.location.search);
  const urlPickerId = urlParams.get("pickerId");
  
  React.useEffect(() => {
    if (urlPickerId) setFilterPicker(urlPickerId);
  }, [urlPickerId]);

  const { data: pickers } = useListPickers({
    query: { queryKey: getListPickersQueryKey() }
  });

  const queryParams = filterPicker !== "all" ? { pickerId: parseInt(filterPicker) } : {};
  
  const { data: picks, isLoading } = useListPicks(
    queryParams,
    { query: { queryKey: getListPicksQueryKey(queryParams) } }
  );

  const createPick = useCreatePick();
  const deletePick = useDeletePick();

  const addForm = useForm<z.infer<typeof pickSchema>>({
    resolver: zodResolver(pickSchema),
    defaultValues: {
      pickerId: urlPickerId ? parseInt(urlPickerId) : 0,
      itemSku: "",
      quantity: 1,
      zone: "",
      pickedAt: new Date().toISOString().slice(0, 16), // YYYY-MM-DDThh:mm
      durationSeconds: null,
      notes: "",
    },
  });

  const onAddSubmit = (values: z.infer<typeof pickSchema>) => {
    // Format to proper ISO-8601 string if it comes from datetime-local
    let pickedAt = values.pickedAt;
    if (pickedAt.length === 16) {
      pickedAt = new Date(pickedAt).toISOString();
    }

    createPick.mutate({ data: { ...values, pickedAt } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPicksQueryKey(queryParams) });
        queryClient.invalidateQueries({ queryKey: getListPicksQueryKey({}) }); // also invalidate all picks
        setIsAddOpen(false);
        addForm.reset({
          pickerId: values.pickerId,
          itemSku: "",
          quantity: 1,
          zone: values.zone,
          pickedAt: new Date().toISOString().slice(0, 16),
          durationSeconds: null,
          notes: "",
        });
        toast({
          title: "Pick Logged",
          description: `Successfully logged pick for SKU ${values.itemSku}.`,
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to log pick. Please try again.",
        });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this pick log? This action cannot be undone.")) {
      deletePick.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPicksQueryKey(queryParams) });
          queryClient.invalidateQueries({ queryKey: getListPicksQueryKey({}) });
          toast({
            title: "Pick Log Deleted",
            description: "The pick log has been permanently removed.",
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to delete pick log.",
          });
        }
      });
    }
  };

  const filteredPicks = picks?.filter(p => 
    p.itemSku.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.pickerName && p.pickerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.zone && p.zone.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.notes && p.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pick Operations Log</h1>
          <p className="text-muted-foreground">Detailed history of all picking activities.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Manual Log Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Pick Operation</DialogTitle>
              <DialogDescription>
                Manually record a pick operation if the automated system missed it.
              </DialogDescription>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="pickerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Picker</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value ? String(field.value) : undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a picker" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pickers?.map(picker => (
                            <SelectItem key={picker.id} value={String(picker.id)}>
                              {picker.name} ({picker.employeeId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={addForm.control}
                    name="itemSku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl>
                          <Input placeholder="ITM-123" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={addForm.control}
                    name="zone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Zone (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="A1" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="durationSeconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (sec)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1" 
                            placeholder="e.g. 45" 
                            {...field} 
                            value={field.value || ""} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={addForm.control}
                  name="pickedAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time Picked</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={addForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Any exceptions or issues?" 
                          className="resize-none" 
                          {...field} 
                          value={field.value || ""} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={createPick.isPending}>
                    {createPick.isPending ? "Logging..." : "Log Pick"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card border rounded-md p-4">
        <div className="flex-1 flex items-center space-x-2 bg-background border rounded-md px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search SKUs, zones, notes..." 
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-8 p-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="w-full sm:w-64 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={filterPicker} onValueChange={setFilterPicker}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Filter by picker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pickers</SelectItem>
              {pickers?.map((picker) => (
                <SelectItem key={picker.id} value={String(picker.id)}>
                  {picker.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time <ArrowUpDown className="ml-1 h-3 w-3 inline" /></TableHead>
              <TableHead>Picker</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-8 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredPicks?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No pick logs found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredPicks?.map((pick) => (
                <TableRow key={pick.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {format(parseISO(pick.pickedAt), 'MMM d, yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {pick.pickerName ? (
                      <Link href={`/pickers/${pick.pickerId}`} className="hover:underline text-primary">
                        {pick.pickerName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground italic">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell className="font-bold font-mono text-sm">{pick.itemSku}</TableCell>
                  <TableCell className="text-right font-medium">{pick.quantity}</TableCell>
                  <TableCell>
                    {pick.zone ? (
                      <Badge variant="secondary" className="font-mono text-xs">{pick.zone}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {pick.durationSeconds ? (
                      <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                        {pick.durationSeconds}s
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {pick.notes || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(pick.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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