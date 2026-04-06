import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  Trophy, 
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Pickers", href: "/pickers", icon: Users },
  { name: "Picks", href: "/picks", icon: Package },
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Sidebar */}
      <div className="md:hidden border-b p-4 flex items-center justify-between bg-card">
        <div className="font-bold text-xl tracking-tight text-primary flex items-center gap-2">
          <Package className="h-6 w-6" />
          OP-TRACK
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] p-0">
            <div className="p-4 border-b">
              <div className="font-bold text-xl tracking-tight text-primary flex items-center gap-2">
                <Package className="h-6 w-6" />
                OP-TRACK
              </div>
            </div>
            <nav className="p-4 space-y-2">
              {navigation.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link key={item.name} href={item.href}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                    }`}>
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-[240px] flex-col border-r bg-card h-screen sticky top-0">
        <div className="p-6 border-b">
          <div className="font-bold text-2xl tracking-tight text-primary flex items-center gap-2">
            <Package className="h-7 w-7" />
            OP-TRACK
          </div>
          <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-mono">
            Warehouse Efficiency
          </div>
        </div>
        <nav className="p-4 space-y-2 flex-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer ${
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                }`}>
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t text-xs text-muted-foreground font-mono">
          System Status: <span className="text-green-500 font-bold">ONLINE</span>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
