import { useState } from "wouter/use-location";
import { Link } from "wouter";
import { 
  useListPickers, 
  getListPickersQueryKey,
  useCreatePicker,
  useUpdatePicker,
  useDeletePicker
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
import { Plus, Search, MoreHorizontal, Edit, Trash2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import React from "react";

const pickerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  employeeId: z.string().min(2, "Employee ID is required"),
  zone: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export default function PickersList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [editingPicker, setEditingPicker] = React.useState<number | null>(null);
  
  const { data: pickers, isLoading } = useListPickers({
    query: { queryKey: getListPickersQueryKey() }
  });

  const createPicker = useCreatePicker();
  const updatePicker = useUpdatePicker();
  const deletePicker = useDeletePicker();

  const addForm = useForm<z.infer<typeof pickerSchema>>({
    resolver: zodResolver(pickerSchema),
    defaultValues: {
      name: "",
      employeeId: "",
      zone: "",
      active: true,
    },
  });

  const editForm = useForm<z.infer<typeof pickerSchema>>({
    resolver: zodResolver(pickerSchema),
    defaultValues: {
      name: "",
      employeeId: "",
      zone: "",
      active: true,
    },
  });

  const onAddSubmit = (values: z.infer<typeof pickerSchema>) => {
    createPicker.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPickersQueryKey() });
        setIsAddOpen(false);
        addForm.reset();
        toast({
          title: "Picker added",
          description: `${values.name} has been added to the system.`,
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to add picker. Please try again.",
        });
      }
    });
  };

  const onEditSubmit = (values: z.infer<typeof pickerSchema>) => {
    if (!editingPicker) return;
    updatePicker.mutate({ id: editingPicker, data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPickersQueryKey() });
        setEditingPicker(null);
        toast({
          title: "Picker updated",
          description: `${values.name}'s profile has been updated.`,
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update picker. Please try again.",
        });
      }
    });
  };

  const handleDelete = (id: number, name: string) => {
    deletePicker.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPickersQueryKey() });
        toast({
          title: "Picker deleted",
          description: `${name} has been removed from the system.`,
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to delete picker. Please try again.",
        });
      }
    });
  };

  const filteredPickers = pickers?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.zone && p.zone.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Personnel</h1>
          <p className="text-muted-foreground">Manage warehouse pickers and view individual performance.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Picker
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Picker</DialogTitle>
              <DialogDescription>
                Register a new picker in the system to start tracking their efficiency.
              </DialogDescription>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addForm.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee ID</FormLabel>
                      <FormControl>
                        <Input placeholder="EMP-1234" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addForm.control}
                  name="zone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Zone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. A1, North Wing" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addForm.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active Status</FormLabel>
                        <DialogDescription>
                          Can this picker be assigned to new picks?
                        </DialogDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createPicker.isPending}>
                    {createPicker.isPending ? "Adding..." : "Add Picker"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2 bg-card border rounded-md px-3 py-2 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search pickers..." 
          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-8 p-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Picker Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredPickers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No pickers found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredPickers?.map((picker) => (
                <TableRow key={picker.id}>
                  <TableCell className="font-medium">
                    <Link href={`/pickers/${picker.id}`} className="hover:underline flex items-center gap-2">
                      {picker.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{picker.employeeId}</TableCell>
                  <TableCell>{picker.zone || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                  <TableCell>
                    {picker.active ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                        <ShieldCheck className="h-3 w-3 mr-1" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800">
                        <ShieldAlert className="h-3 w-3 mr-1" /> Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link href={`/pickers/${picker.id}`} className="w-full cursor-pointer">
                            View Profile
                          </Link>
                        </DropdownMenuItem>
                        <Dialog open={editingPicker === picker.id} onOpenChange={(open) => {
                          if (open) {
                            editForm.reset({
                              name: picker.name,
                              employeeId: picker.employeeId,
                              zone: picker.zone,
                              active: picker.active
                            });
                            setEditingPicker(picker.id);
                          } else {
                            setEditingPicker(null);
                          }
                        }}>
                          <DialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Picker Profile</DialogTitle>
                            </DialogHeader>
                            <Form {...editForm}>
                              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                                <FormField
                                  control={editForm.control}
                                  name="name"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Full Name</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={editForm.control}
                                  name="employeeId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Employee ID</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={editForm.control}
                                  name="zone"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Default Zone (Optional)</FormLabel>
                                      <FormControl>
                                        <Input {...field} value={field.value || ""} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={editForm.control}
                                  name="active"
                                  render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                      <div className="space-y-0.5">
                                        <FormLabel className="text-base">Active Status</FormLabel>
                                      </div>
                                      <FormControl>
                                        <Switch
                                          checked={field.value}
                                          onCheckedChange={field.onChange}
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <DialogFooter>
                                  <Button type="submit" disabled={updatePicker.isPending}>
                                    {updatePicker.isPending ? "Saving..." : "Save Changes"}
                                  </Button>
                                </DialogFooter>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                        
                        <DropdownMenuSeparator />
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:bg-destructive focus:text-destructive-foreground">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete <strong>{picker.name}</strong>'s profile.
                                Pick logs associated with this picker might be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDelete(picker.id, picker.name)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deletePicker.isPending ? "Deleting..." : "Delete Picker"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
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